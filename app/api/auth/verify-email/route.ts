import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { apiError, handleApiError } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { sendEmail, welcomeEmailHtml } from "@/lib/email";

const DASHBOARD_URL = `${process.env.NEXTAUTH_URL ?? "https://estimatenepal.com"}/dashboard`;

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = req.nextUrl.searchParams.get("token");
    if (!token) return apiError("VALIDATION_ERROR", "Missing token.", 400);

    let userId = await redis.get(`verify:${token}`);

    // DB fallback: Redis token missing (e.g. after a flush) — look up by token column
    if (!userId) {
      const dbUser = await prisma.user.findUnique({
        where: { verifyToken: token },
        select: { id: true, verifyTokenAt: true },
      });
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      if (
        !dbUser ||
        !dbUser.verifyTokenAt ||
        Date.now() - dbUser.verifyTokenAt.getTime() > TWENTY_FOUR_HOURS
      ) {
        return apiError("VALIDATION_ERROR", "Invalid or expired token.", 400);
      }
      userId = dbUser.id;
    }

    // L4: Fetch org.trialEndsAt alongside the user so welcome email can show the trial expiry date
    const user = await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, verifyToken: null, verifyTokenAt: null },
      select: { name: true, email: true, org: { select: { trialEndsAt: true } } },
    });
    await redis.del(`verify:${token}`);

    sendEmail({
      to: user.email,
      subject: "Welcome to Estimate Nepal — here's how to get started",
      html: welcomeEmailHtml(user.name, DASHBOARD_URL, user.org?.trialEndsAt ?? null),
    }).catch((err: Error) => console.error("[verify-email] welcome email failed:", err.message));

    return NextResponse.redirect(new URL("/login?verified=1", process.env.NEXTAUTH_URL));
  } catch (err) {
    return handleApiError(err);
  }
}
