import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendEmail, passwordResetEmailHtml } from "@/lib/email";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { apiError, handleApiError } from "@/lib/errors";

const schema = z.object({ email: z.string().email() });

const SUCCESS_MSG = "If that email is registered, a reset link has been sent.";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid email.", 400);

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    // Always return success to prevent email enumeration
    if (!user) return NextResponse.json({ message: SUCCESS_MSG });

    const token = crypto.randomBytes(32).toString("hex");
    // Invalidate any previous reset token for this user before issuing a new one
    const prevToken = await redis.get(`reset_user:${user.id}`);
    if (prevToken) await redis.del(`reset:${prevToken}`);
    await redis.set(`reset_user:${user.id}`, token, "EX", 3600);
    await redis.set(`reset:${token}`, user.id, "EX", 3600);

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
    // Fire-and-forget — reset tokens are already in Redis; SMTP latency must not block the response.
    sendEmail({
      to: user.email,
      subject: "Reset your Estimate Nepal password",
      html: passwordResetEmailHtml(resetUrl),
    }).catch((emailErr) => {
      console.error("[forgot-password] Failed to send reset email:", { email: user.email, emailErr });
    });

    return NextResponse.json({ message: SUCCESS_MSG });
  } catch (err) {
    return handleApiError(err);
  }
}
