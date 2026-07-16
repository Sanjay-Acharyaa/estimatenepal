import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const VALID_REASONS = ["too_expensive", "missing_features", "just_exploring", "competitor"];

const NO_CACHE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const limited = await checkApiRateLimit(getClientIp(req));
  if (limited) return limited;

  const { searchParams } = req.nextUrl;
  const reason = searchParams.get("reason");
  const orgId  = searchParams.get("org");
  const key    = searchParams.get("key");

  if (!reason || !VALID_REASONS.includes(reason) || !orgId) {
    return new NextResponse("Invalid feedback link.", { status: 400, headers: NO_CACHE });
  }

  // CS1: Throw hard if secret is not configured.
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");

  const expected = createHmac("sha256", secret).update(orgId).digest("hex").slice(0, 20);

  // C1: Timing-safe comparison prevents HMAC oracle attacks.
  if (!key || key.length !== expected.length || !timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    return new NextResponse("Invalid or expired link.", { status: 400, headers: NO_CACHE });
  }

  // CS2: First-click-wins — only update if churnReason is not yet set.
  await prisma.org.updateMany({
    where: { id: orgId, churnReason: null },
    data: { churnReason: reason },
  }).catch((err: Error) => console.error("[feedback/churn] DB update failed:", err.message));

  // H2/L2: Redirect to a proper Next.js page instead of returning inline HTML.
  const base = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";
  const dest = new URL("/feedback/thanks", base);
  dest.searchParams.set("type", "churn");
  dest.searchParams.set("reason", reason);
  return NextResponse.redirect(dest, { headers: NO_CACHE });
}
