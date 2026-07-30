import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { apiError, handleApiError, conflict } from "@/lib/errors";
import { getConfigNum, getConfigBool } from "@/lib/config";

const schema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().toLowerCase().trim(),
  phone: z.string()
    .min(7, "Phone number is too short.")
    .max(20)
    .transform(p => p.replace(/[\s\-]/g, ""))
    .refine(p => /^\+?[0-9]{7,15}$/.test(p), "Enter a valid phone number with country code (e.g. +977 9812345678)."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(100)
    .refine(
      (p) => /[A-Z]/.test(p) && /[0-9]/.test(p),
      "Password must contain at least one uppercase letter and one number."
    ),
  orgName: z.string().min(2).max(100).trim(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));
    }

    const { name, email, phone, password, orgName } = parsed.data;

    // Check registration gate before touching the DB
    const registrationEnabled = await getConfigBool("registration_enabled");
    if (!registrationEnabled) {
      return apiError("FORBIDDEN", "New registrations are temporarily paused. Please try again later.", 403);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict("Email already registered.");

    const passwordHash = await bcrypt.hash(password, 10);
    const verifyToken = crypto.randomBytes(32).toString("hex");

    const trialDays = await getConfigNum("trial_days");
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    // Read UTM cookies set by middleware when the user first landed on the site
    const utmSource   = req.cookies.get("utm_source")?.value   ?? null;
    const utmMedium   = req.cookies.get("utm_medium")?.value   ?? null;
    const utmCampaign = req.cookies.get("utm_campaign")?.value ?? null;

    const { org, user } = await prisma.$transaction(async (tx) => {
      const org = await tx.org.create({ data: { name: orgName, trialEndsAt } });
      const user = await tx.user.create({
        data: {
          name, email, phone, passwordHash, role: "OWNER", orgId: org.id,
          referralSource:   utmSource,
          referralMedium:   utmMedium,
          referralCampaign: utmCampaign,
        },
      });
      return { org, user };
    });

    const { redis } = await import("@/lib/redis");
    await redis.set(`verify:${verifyToken}`, user.id, "EX", 86400);

    const verifyUrl = `${process.env.NEXTAUTH_URL}/api/auth/verify-email?token=${verifyToken}`;

    // Fire-and-forget — SMTP latency must not block the registration response.
    // The verify token is already committed to Redis; the user can request a resend if email fails.
    sendEmail({
      to: email,
      subject: "Verify your Estimate Nepal account",
      html: verificationEmailHtml(verifyUrl, name),
    }).catch((emailErr) => {
      console.error("[register] Failed to send verification email:", { email, emailErr });
    });

    return NextResponse.json(
      { message: "Registration successful. Check your email to verify your account." },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
