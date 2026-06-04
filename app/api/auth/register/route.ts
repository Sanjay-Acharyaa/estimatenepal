import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { checkApiRateLimit } from "@/lib/security";
import { apiError, handleApiError, conflict } from "@/lib/errors";

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  orgName: z.string().min(2).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    const { name, email, password, orgName } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict("Email already registered.");

    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = crypto.randomBytes(32).toString("hex");

    const org = await prisma.org.create({ data: { name: orgName } });
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: "OWNER", orgId: org.id },
    });

    const { redis } = await import("@/lib/redis");
    await redis.set(`verify:${verifyToken}`, user.id, "EX", 86400);

    const verifyUrl = `${process.env.NEXTAUTH_URL}/api/auth/verify-email?token=${verifyToken}`;
    try {
      await sendEmail({
        to: email,
        subject: "Verify your NepaliEstimate account",
        html: verificationEmailHtml(verifyUrl, name),
      });
    } catch (emailErr) {
      // Roll back — user is stuck if email fails and DB record stays
      await redis.del(`verify:${verifyToken}`);
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.org.delete({ where: { id: org.id } });
      throw emailErr;
    }

    return NextResponse.json(
      { message: "Registration successful. Check your email to verify your account." },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
