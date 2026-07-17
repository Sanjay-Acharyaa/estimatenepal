import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const NO_CACHE = { "Cache-Control": "no-store, max-age=0" };
const ADMIN_EMAIL = "hello@estimatenepal.com";

export async function POST(req: NextRequest) {
  const limited = await checkApiRateLimit(getClientIp(req));
  if (limited) return limited;

  const base = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";

  let orgId: string | null = null;
  let key:   string | null = null;
  let text:  string | null = null;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    orgId = form.get("orgId") as string | null;
    key   = form.get("key")   as string | null;
    text  = form.get("text")  as string | null;
  } else {
    const body = await req.json().catch(() => ({}));
    orgId = body.orgId ?? null;
    key   = body.key   ?? null;
    text  = body.text  ?? null;
  }

  const thanksUrl = new URL("/feedback/thanks?type=churn&reason=other", base);

  if (!orgId || !key || !text?.trim()) {
    return NextResponse.redirect(thanksUrl, { headers: NO_CACHE });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");

  const expected = createHmac("sha256", secret).update(orgId).digest("hex").slice(0, 20);

  // Redirect to thanks page on invalid HMAC instead of raw 400
  if (key.length !== expected.length || !timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    return NextResponse.redirect(new URL("/feedback/thanks?type=churn", base), { headers: NO_CACHE });
  }

  const truncated = text.trim().slice(0, 2000);

  // Save feedback; set churnReason to "other" only if not already captured via button click.
  const now = new Date();
  await prisma.$transaction([
    prisma.org.updateMany({
      where: { id: orgId, churnReason: null },
      data: { churnReason: "other" },
    }),
    prisma.org.update({
      where: { id: orgId },
      data: { churnFeedback: truncated, churnFeedbackAt: now },
    }),
  ]).catch((err: Error) =>
    console.error("[feedback/churn-text] DB save failed:", err.message)
  );

  // Fire admin alert — don't await
  prisma.org.findFirst({
    where: { id: orgId },
    select: {
      name: true,
      users: { where: { role: "OWNER" as const }, select: { email: true }, take: 1 },
    },
  }).then(org => {
    if (!org) return;
    const ownerEmail = org.users[0]?.email ?? "unknown";
    const safeText = truncated
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
    return sendEmail({
      to: ADMIN_EMAIL,
      subject: `New churn feedback: ${org.name}`,
      html: `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;color:#334155">
        <h2 style="color:#0f172a;margin:0 0 16px">New open-text churn feedback</h2>
        <p><strong>Organisation:</strong> ${org.name}</p>
        <p><strong>Owner email:</strong> ${ownerEmail}</p>
        <p><strong>Submitted:</strong> ${now.toLocaleString("en-GB")}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
        <p style="background:#f8fafc;border-left:3px solid #1d4ed8;padding:12px 16px;color:#475569">${safeText}</p>
      </body></html>`,
    });
  }).catch(err => console.error("[feedback/churn-text] admin alert failed:", (err as Error).message));

  return NextResponse.redirect(thanksUrl, { headers: NO_CACHE });
}
