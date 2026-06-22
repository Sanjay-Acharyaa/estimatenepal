import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { apiError, handleApiError } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const schema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(100)
    .refine(
      (p) => /[A-Z]/.test(p) && /[0-9]/.test(p),
      "Password must contain at least one uppercase letter and one number."
    ),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    const { token, password } = parsed.data;
    const userId = await redis.get(`reset:${token}`);
    if (!userId) return apiError("VALIDATION_ERROR", "Invalid or expired reset token.", 400);

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: now },
    });
    await Promise.all([
      redis.del(`reset:${token}`),
      redis.del(`reset_user:${userId}`),
      // Signal active JWTs to self-invalidate — key TTL matches max session lifetime
      redis.set(`pw_changed:${userId}`, now.getTime().toString(), "EX", 7 * 24 * 3600),
    ]);

    return NextResponse.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    return handleApiError(err);
  }
}
