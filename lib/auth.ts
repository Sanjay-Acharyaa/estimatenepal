import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { z } from "zod";
import { ApiException } from "./errors";

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
          (req?.headers?.["x-forwarded-for"] as string | undefined) ?? "unknown";

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user || !user.emailVerified) {
          // Record failed attempt if user exists
          if (user) {
            await prisma.failedLogin.create({
              data: { userId: user.id, email: parsed.data.email, ipAddress: ip },
            });
          }
          return null;
        }

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          await prisma.failedLogin.create({
            data: { userId: user.id, email: parsed.data.email, ipAddress: ip },
          });
          return null;
        }

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
            select: { trialEndsAt: true },
          });
          token.trialEndsAt = org?.trialEndsAt?.toISOString() ?? null;
        }
      } else if (token.id) {
        // On every request after login: check if password was changed after token issued
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { passwordChangedAt: true },
        });
        if (dbUser?.passwordChangedAt) {
          const changedAt = dbUser.passwordChangedAt.getTime();
          const issuedAt = ((token.iat as number) ?? 0) * 1000;
          if (changedAt > issuedAt) {
            // Password was changed after this token was issued — invalidate
            return { ...token, invalidated: true };
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.invalidated) {
        // Token was invalidated due to password change — return empty session
        return { ...session, user: undefined as any, expires: new Date(0).toISOString() };
      }
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.isSuperAdmin = token.isSuperAdmin as boolean;
        session.user.orgId = token.orgId as string | null;
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

// Verifies the calling user owns or belongs to the resource's org
export async function withTenantGuard(userId: string, resourceOrgId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiException("UNAUTHORIZED", "Authentication required.", 401);
  if (user.isSuperAdmin) return user;
  if (user.orgId !== resourceOrgId) throw new ApiException("FORBIDDEN", "You do not have permission to do this.", 403);
  return user;
}
