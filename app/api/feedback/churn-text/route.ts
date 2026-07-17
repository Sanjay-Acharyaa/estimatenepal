import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const NO_CACHE = { "Cache-Control": "no-store, max-age=0" };

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

  if (key.length !== expected.length || !timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    return new NextResponse("Invalid or expired link.", { status: 400, headers: NO_CACHE });
  }

  const truncated = text.trim().slice(0, 2000);

  // Save feedback; also set churnReason to "other" only if not already captured via button click.
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

  return NextResponse.redirect(thanksUrl, { headers: NO_CACHE });
}
