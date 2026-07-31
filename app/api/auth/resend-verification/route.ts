import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { apiError, handleApiError } from "@/lib/errors";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid email.", 400);

    // Per-email rate limit: max 3 verification resend requests per hour
    const emailKey = `rl:resendverify:${parsed.data.email.toLowerCase()}`;
    const emailCount = await redis.incr(emailKey);
    if (emailCount === 1) await redis.expire(emailKey, 3600);
    if (emailCount > 3) {
      return NextResponse.json({ message: "If this email exists and is unverified, a new link has been sent." });
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

    // Always return success to avoid email enumeration
    if (!user || user.emailVerified) {
      return NextResponse.json({ message: "If this email exists and is unverified, a new link has been sent." });
    }
    const verifyToken = crypto.randomBytes(32).toString("hex");
    await Promise.all([
      redis.set(`verify:${verifyToken}`, user.id, "EX", 86400),
      prisma.user.update({
        where: { id: user.id },
        data: { verifyToken, verifyTokenAt: new Date() },
      }),
    ]);

    const verifyUrl = `${process.env.NEXTAUTH_URL}/api/auth/verify-email?token=${verifyToken}`;
    sendEmail({
      to: user.email,
      subject: "Verify your Estimate Nepal account",
      html: verificationEmailHtml(verifyUrl, user.name),
    }).catch((emailErr) => {
      console.error("[resend-verification] Failed to send email:", { email: user.email, emailErr });
    });

    return NextResponse.json({ message: "If this email exists and is unverified, a new link has been sent." });
  } catch (err) {
    return handleApiError(err);
  }
}
