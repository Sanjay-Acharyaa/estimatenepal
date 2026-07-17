import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// POST /api/webhooks/resend
// Resend delivery event webhook. Protected by Svix HMAC signature (whsec_ secret).
// Set RESEND_WEBHOOK_SECRET in env to the webhook signing secret from Resend dashboard.
// Updates EmailLog status and User.emailBouncedAt for hard delivery failures.

function verifyResendWebhook(body: string, headers: Headers): boolean {
  const svixId        = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;

  // H1: Reject replays — timestamp must be within 5 minutes + 30s clock-skew buffer (L3).
  const ts  = parseInt(svixTimestamp, 10);
  const age = Math.abs(Date.now() / 1000 - ts);
  if (isNaN(ts) || age > 330) return false;

  const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
  const msgToSign   = `${svixId}.${svixTimestamp}.${body}`;
  const hmac        = createHmac("sha256", secretBytes).update(msgToSign).digest("base64");

  const signatures = svixSignature
    .split(" ")
    .map((s) => s.split("v1,")[1])
    .filter(Boolean);

  // C2: Timing-safe comparison prevents HMAC oracle attacks on the webhook secret.
  return signatures.some((sig) => {
    try {
      const sigBuf  = Buffer.from(sig, "base64");
      const hmacBuf = Buffer.from(hmac, "base64");
      return sigBuf.length === hmacBuf.length && timingSafeEqual(sigBuf, hmacBuf);
    } catch {
      return false;
    }
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyResendWebhook(rawBody, req.headers)) {
    console.warn("[webhooks/resend] Signature verification failed — rejected");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { type?: string; data?: { email_id?: string; to?: string[] } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailId   = payload?.data?.email_id;
  const eventType = payload?.type;
  const toAddrs   = payload?.data?.to ?? [];

  if (!emailId || !eventType) {
    return NextResponse.json({ received: true });
  }

  // H2: Hard bounces — mark log failed and permanently suppress future sends to this address.
  if (eventType === "email.bounced") {
    await Promise.all([
      prisma.emailLog.updateMany({
        where: { resendEmailId: emailId },
        data: { status: "failed", errorMessage: "email.bounced" },
      }).catch((err: Error) => console.error("[webhooks/resend] EmailLog bounce update failed:", err.message)),
      ...(toAddrs.length > 0 ? [
        prisma.user.updateMany({
          where: { email: { in: toAddrs }, emailBouncedAt: null },
          data: { emailBouncedAt: new Date() },
        }).catch((err: Error) => console.error("[webhooks/resend] User bounce update failed:", err.message)),
      ] : []),
    ]);
  }

  // Spam complaints — treat as an unsubscribe to respect user preference.
  if (eventType === "email.complained") {
    await Promise.all([
      prisma.emailLog.updateMany({
        where: { resendEmailId: emailId },
        data: { status: "failed", errorMessage: "email.complained" },
      }).catch((err: Error) => console.error("[webhooks/resend] EmailLog complaint update failed:", err.message)),
      ...(toAddrs.length > 0 ? [
        (prisma.user.updateMany as any)({
          where: { email: { in: toAddrs }, emailUnsubscribedAt: null },
          data: { emailUnsubscribedAt: new Date() },
        }).catch((err: Error) => console.error("[webhooks/resend] User unsubscribe (complaint) update failed:", err.message)),
      ] : []),
    ]);
  }

  // L6: Track delivery, open, and click events for dashboard visibility.
  if (eventType === "email.delivered") {
    await prisma.emailLog.updateMany({
      where: { resendEmailId: emailId, deliveredAt: null },
      data: { status: "delivered", deliveredAt: new Date() },
    }).catch((err: Error) => console.error("[webhooks/resend] Delivered update failed:", err.message));
  }

  if (eventType === "email.opened") {
    await prisma.emailLog.updateMany({
      where: { resendEmailId: emailId, openedAt: null },
      data: { openedAt: new Date() },
    }).catch((err: Error) => console.error("[webhooks/resend] Opened update failed:", err.message));
  }

  if (eventType === "email.clicked") {
    await prisma.emailLog.updateMany({
      where: { resendEmailId: emailId, clickedAt: null },
      data: { clickedAt: new Date() },
    }).catch((err: Error) => console.error("[webhooks/resend] Clicked update failed:", err.message));
  }

  return NextResponse.json({ received: true });
}
