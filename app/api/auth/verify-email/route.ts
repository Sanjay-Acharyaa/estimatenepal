import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { apiError, handleApiError } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = req.nextUrl.searchParams.get("token");
    if (!token) return apiError("VALIDATION_ERROR", "Missing token.", 400);

    const userId = await redis.get(`verify:${token}`);
    if (!userId) return apiError("VALIDATION_ERROR", "Invalid or expired token.", 400);

    await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
    await redis.del(`verify:${token}`);

    return NextResponse.redirect(new URL("/login?verified=1", process.env.NEXTAUTH_URL));
  } catch (err) {
    return handleApiError(err);
  }
}
