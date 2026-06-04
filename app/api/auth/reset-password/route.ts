import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { apiError, handleApiError } from "@/lib/errors";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    const { token, password } = parsed.data;
    const userId = await redis.get(`reset:${token}`);
    if (!userId) return apiError("VALIDATION_ERROR", "Invalid or expired reset token.", 400);

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await redis.del(`reset:${token}`);

    return NextResponse.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    return handleApiError(err);
  }
}
