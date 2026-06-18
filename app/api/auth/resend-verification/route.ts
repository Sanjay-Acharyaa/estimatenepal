import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
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

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

    // Always return success to avoid email enumeration
    if (!user || user.emailVerified) {
      return NextResponse.json({ message: "If this email exists and is unverified, a new link has been sent." });
    }

    const { redis } = await import("@/lib/redis");
    const verifyToken = crypto.randomBytes(32).toString("hex");
    await redis.set(`verify:${verifyToken}`, user.id, "EX", 86400);

    const verifyUrl = `${process.env.NEXTAUTH_URL}/api/auth/verify-email?token=${verifyToken}`;
    sendEmail({
      to: user.email,
      subject: "Verify your NepaliEstimate account",
      html: verificationEmailHtml(verifyUrl, user.name),
    }).catch(() => {});

    return NextResponse.json({ message: "If this email exists and is unverified, a new link has been sent." });
  } catch (err) {
    return handleApiError(err);
  }
}
