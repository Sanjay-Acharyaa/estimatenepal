import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { handleApiError, apiError, unauthorized } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { invalidateUserCache } from "@/lib/auth";
import bcrypt from "bcrypt";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(100)
    .refine(
      (p) => /[A-Z]/.test(p) && /[0-9]/.test(p),
      "Password must contain at least one uppercase letter and one number."
    ),
});

// POST /api/auth/change-password
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    const user = await prisma.user.findUnique({ where: { id: token.id as string } });
    if (!user) throw unauthorized();

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) return apiError("UNAUTHORIZED", "Current password is incorrect.", 401);

    const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, passwordChangedAt: now },
    });
    // Signal active JWTs to self-invalidate — key TTL matches max session lifetime
    await redis.set(`pw_changed:${user.id}`, now.getTime().toString(), "EX", 7 * 24 * 3600);
    invalidateUserCache(user.id).catch((e) => console.error("[change-password] cache invalidation failed:", e));

    appendAuditLog({
      orgId: user.orgId ?? "SYSTEM",
      userId: user.id,
      event: "user.password_changed",
      resourceId: user.id,
      meta: {} as any,
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Password updated." });
  } catch (err) {
    return handleApiError(err);
  }
}
