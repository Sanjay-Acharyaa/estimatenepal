import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, churnThanksEmailHtml } from "@/lib/email";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const VALID_REASONS = ["too_expensive", "missing_features", "just_exploring", "competitor", "too_complex", "not_relevant"];

const NO_CACHE = { "Cache-Control": "no-store, max-age=0" };

const UPGRADE_URL = `${process.env.NEXTAUTH_URL ?? "https://estimatenepal.com"}/pricing`;

export async function GET(req: NextRequest) {
  const limited = await checkApiRateLimit(getClientIp(req));
  if (limited) return limited;

  const base = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";
  const { searchParams } = req.nextUrl;
  const reason = searchParams.get("reason");
  const orgId  = searchParams.get("org");
  const key    = searchParams.get("key");

  const thanksUrl = new URL("/feedback/thanks?type=churn", base);

  if (!reason || !VALID_REASONS.includes(reason) || !orgId) {
    thanksUrl.searchParams.set("reason", "invalid");
    return NextResponse.redirect(thanksUrl, { headers: NO_CACHE });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");

  const expected = createHmac("sha256", secret).update(orgId).digest("hex").slice(0, 20);

  // Timing-safe comparison — redirect to thanks on failure instead of raw 400
  if (!key || key.length !== expected.length || !timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    return NextResponse.redirect(new URL("/feedback/thanks?type=churn", base), { headers: NO_CACHE });
  }

  // First-click-wins: only update if churnReason not yet set. Stamp churnReasonAt.
  let updatedCount = 0;
  try {
    const result = await (prisma.org.updateMany as any)({
      where: { id: orgId, churnReason: null },
      data: { churnReason: reason, churnReasonAt: new Date() },
    });
    updatedCount = result?.count ?? 0;
  } catch (err) {
    console.error("[feedback/churn] DB update failed:", (err as Error).message);
  }

  // Send churn_thanks email only on first click (when we actually recorded the reason)
  if (updatedCount > 0) {
    prisma.org.findFirst({
      where: { id: orgId },
      select: {
        name: true,
        users: { where: { role: "OWNER" as const }, select: { name: true, email: true }, take: 1 },
      },
    }).then(org => {
      const owner = org?.users[0];
      if (!owner) return;
      return sendEmail({
        to: owner.email,
        subject: "Thank you for telling us",
        html: churnThanksEmailHtml(owner.name, UPGRADE_URL),
      });
    }).catch(err => console.error("[feedback/churn] churn_thanks send failed:", (err as Error).message));
  }

  thanksUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(thanksUrl, { headers: NO_CACHE });
}
