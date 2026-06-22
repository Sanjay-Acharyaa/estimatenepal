import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { redis } from "./redis";
import { z } from "zod";
import { ApiException } from "./errors";
import { trackEvent } from "./analytics";
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const isProd = process.env.NODE_ENV === "production";

export const authOptions: NextAuthOptions = {
  // 7-day session (cookie lifetime). The 15-min access-token / 7-day refresh-token
  // split is enforced at the API layer via withTenantGuard re-validating the DB user
  // on every write operation rather than through a separate refresh token flow.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const ip =
          (req?.headers?.["x-forwarded-for"] as string | undefined)
            ?.split(",")[0].trim() ?? "unknown";

        const { isLoginRateLimited, consumeLoginFailure } = await import("./security");

        // Block if this ip:email has too many recent failures
        const rateLimited = await isLoginRateLimited(ip, parsed.data.email);
        if (rateLimited) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user || !user.emailVerified) {
          // Consume a token only on a real credential failure, not server errors
          await consumeLoginFailure(ip, parsed.data.email);
          if (user) {
            await prisma.failedLogin.create({
              data: { userId: user.id, email: parsed.data.email, ipAddress: ip },
            });
          }
          return null;
        }

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          await consumeLoginFailure(ip, parsed.data.email);
          await prisma.failedLogin.create({
            data: { userId: user.id, email: parsed.data.email, ipAddress: ip },
          });
          return null;
        }

        // Opportunistically re-hash to BCRYPT_COST if stored hash used a higher cost
        const BCRYPT_COST = 10;
        if (bcrypt.getRounds(user.passwordHash) > BCRYPT_COST) {
          bcrypt.hash(parsed.data.password, BCRYPT_COST).then(newHash =>
            prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } })
          ).catch(() => {});
        }

        // Update last login timestamp + fire analytics event (fire-and-forget)
        prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
        trackEvent("user_login", { userId: user.id, orgId: user.orgId });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isSuperAdmin: user.isSuperAdmin,
          orgId: user.orgId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.isSuperAdmin = (user as any).isSuperAdmin;
        token.orgId = (user as any).orgId;
        token.passwordChangedAt = (user as any).passwordChangedAt?.toISOString() ?? null;
        if ((user as any).orgId) {
          const org = await prisma.org.findUnique({
            where: { id: (user as any).orgId },
            select: { name: true, trialEndsAt: true },
          });
          token.orgName = org?.name ?? null;
          token.trialEndsAt = org?.trialEndsAt?.toISOString() ?? null;
        }
        // Single active session: increment sequence counter on every new login.
        // Old tokens with a lower seq number are invalidated by the check below.
        const seq = await redis.incr(`session_seq:${user.id}`).catch(() => 0);
        if (seq > 0) {
          await redis.expire(`session_seq:${user.id}`, 7 * 24 * 60 * 60).catch(() => {});
        }
        token.sessionSeq = seq;
      } else if (token.id) {
        // Redis key written on every password change — avoids a DB query on every request.
        // TTL matches max JWT lifetime so the key auto-expires when no active tokens remain.
        const changedAtStr = await redis.get(`pw_changed:${token.id}`).catch(() => null);
        if (changedAtStr) {
          const changedAt = parseInt(changedAtStr, 10);
          const issuedAt = ((token.iat as number) ?? 0) * 1000;
          if (changedAt > issuedAt) {
            return { ...token, invalidated: true };
          }
        }
        // Single active session: verify this token's sequence matches the latest login.
        // Only enforce for tokens that carry a seq (i.e. issued after this feature shipped).
        if (token.sessionSeq !== undefined) {
          const seqStr = await redis.get(`session_seq:${token.id}`).catch(() => null);
          if (seqStr !== null && parseInt(seqStr, 10) !== token.sessionSeq) {
            return { ...token, invalidated: true };
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.invalidated) {
        // Token was invalidated due to password change or new login on another device
        return { ...session, user: undefined as any, expires: new Date(0).toISOString() };
      }
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.isSuperAdmin = token.isSuperAdmin as boolean;
        session.user.orgId = token.orgId as string | null;
        session.user.trialEndsAt = token.trialEndsAt as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  cookies: {
    sessionToken: {
      // __Secure- prefix requires HTTPS; use plain name in development
      name: isProd
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        secure: isProd,
      },
    },
  },
};

export async function getSession() {
  return getServerSession(authOptions);
}

const TENANT_CACHE_TTL = 60; // seconds

// Verifies the calling user owns or belongs to the resource's org.
// User identity fields (orgId, role, isSuperAdmin) are Redis-cached for 60s to
// avoid a DB roundtrip on every authenticated request.
export async function withTenantGuard(userId: string, resourceOrgId: string) {
  const cacheKey = `user_identity:${userId}`;
  let user: { id: string; orgId: string | null; role: string; isSuperAdmin: boolean; name: string } | null = null;

  const cached = await redis.get(cacheKey);
  if (cached) {
    user = JSON.parse(cached);
  } else {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, orgId: true, role: true, isSuperAdmin: true, name: true },
    });
    if (dbUser) {
      user = dbUser;
      // Fire-and-forget — cache miss latency only paid once per 60s window
      redis.set(cacheKey, JSON.stringify(dbUser), "EX", TENANT_CACHE_TTL).catch(() => {});
    }
  }

  if (!user) throw new ApiException("UNAUTHORIZED", "Authentication required.", 401);
  if (user.isSuperAdmin) return user as any;
  if (user.orgId !== resourceOrgId) throw new ApiException("FORBIDDEN", "You do not have permission to do this.", 403);
  return user as any;
}

// Call this after any role/org mutation so the cache doesn't serve stale data
export async function invalidateUserCache(userId: string) {
  await redis.del(`user_identity:${userId}`);
}
