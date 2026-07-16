import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

// POST /api/webhooks/resend
// Resend delivery event webhook. Protected by Svix HMAC signature (whsec_ secret).
// Set RESEND_WEBHOOK_SECRET in env to the webhook signing secret from Resend dashboard.
// Updates EmailLog.status to "bounced" or "complained" for true delivery failures.

function verifyResendWebhook(body: string, headers: Headers): boolean {
  const svixId        = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;

  // H1: Reject replays — timestamp must be within 5 minutes of now.
  const ts  = parseInt(svixTimestamp, 10);
  const age = Math.abs(Date.now() / 1000 - ts);
  if (isNaN(ts) || age > 300) return false;

  const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
  const msgToSign   = `${svixId}.${svixTimestamp}.${body}`;
  const hmac        = createHmac("sha256", secretBytes).update(msgToSign).digest("base64");

  // svix-signature is a space-delimited list of "v1,<base64>" strings
  const signatures = svixSignature
    .split(" ")
    .map((s) => s.split("v1,")[1])
    .filter(Boolean);

  return signatures.some((sig) => sig === hmac);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyResendWebhook(rawBody, req.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { type?: string; data?: { email_id?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailId   = payload?.data?.email_id;
  const eventType = payload?.type;

  if (emailId && eventType) {
    // H2: Only treat hard/permanent failures as "failed".
    // email.delivery_delayed is transient — the email may still deliver.
    const hardFailures = new Set(["email.bounced", "email.complained"]);

    if (hardFailures.has(eventType)) {
      await prisma.emailLog.updateMany({
        where: { resendEmailId: emailId },
        data: { status: "failed", errorMessage: eventType },
      }).catch((err: Error) =>
        console.error("[webhooks/resend] DB update failed:", err.message)
      );
    }
    // email.delivered — could set status="delivered" in a future enhancement.
  }

  return NextResponse.json({ received: true });
}
