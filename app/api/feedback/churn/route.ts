import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
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

  // CS1: Throw hard if secret is not configured — never fall back to a known string.
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");

  const expected = createHmac("sha256", secret).update(orgId).digest("hex").slice(0, 20);
  if (!key || key !== expected) {
    return new Response("<h2>Invalid or expired link.</h2>", {
      status: 400,
      headers: { "Content-Type": "text/html", ...NO_CACHE },
    });
  }

  // CS2: First-click-wins — only update if churnReason is not yet set.
  await prisma.org.updateMany({
    where: { id: orgId, churnReason: null },
    data: { churnReason: reason },
  }).catch(() => {});

  const labels: Record<string, string> = {
    too_expensive:    "Too expensive",
    missing_features: "Missing features",
    just_exploring:   "Just exploring",
    competitor:       "Went with a competitor",
  };

  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Thank you</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f1f5f9}
    .card{background:#fff;border-radius:12px;padding:40px;text-align:center;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    h2{color:#0f172a;margin:0 0 8px}p{color:#64748b;font-size:15px}</style></head>
    <body><div class="card">
      <div style="font-size:40px;margin-bottom:16px">&#x1F64F;</div>
      <h2>Thank you for your feedback!</h2>
      <p>You selected: <strong>${labels[reason] ?? reason}</strong></p>
      <p>Your response helps us improve Estimate Nepal. We appreciate you taking the time.</p>
    </div></body></html>`,
    { headers: { "Content-Type": "text/html", ...NO_CACHE } }
  );
}
