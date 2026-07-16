import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const NO_CACHE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const limited = await checkApiRateLimit(getClientIp(req));
  if (limited) return limited;

  const { searchParams } = req.nextUrl;
  const scoreStr = searchParams.get("score");
  const userId   = searchParams.get("user");
  const key      = searchParams.get("key");
  const score    = parseInt(scoreStr ?? "", 10);

  if (!userId || isNaN(score) || score < 0 || score > 10) {
    return new NextResponse("Invalid NPS link.", { status: 400, headers: NO_CACHE });
  }

  // CS1: Throw hard if secret is not configured — never fall back to a known string.
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");

  const expected = createHmac("sha256", secret).update(userId).digest("hex").slice(0, 20);
  if (!key || key !== expected) {
    return new Response("<h2>Invalid or expired link.</h2>", {
      status: 400,
      headers: { "Content-Type": "text/html", ...NO_CACHE },
    });
  }

  // CS2: First-click-wins — only update if npsScore has not been recorded yet.
  await prisma.user.updateMany({
    where: { id: userId, npsScore: null },
    data: { npsScore: score },
  }).catch(() => {});

  const emoji   = score >= 9 ? "&#x1F60D;" : score >= 7 ? "&#x1F60A;" : score >= 5 ? "&#x1F610;" : "&#x1F615;";
  const message = score >= 9
    ? "Amazing! We're so glad you love it."
    : score >= 7
    ? "Thanks — we're glad it's working for you."
    : score >= 5
    ? "Thanks for your honesty. We'll keep improving."
    : "We're sorry to hear that. We'll work on it.";

  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Thank you</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f1f5f9}
    .card{background:#fff;border-radius:12px;padding:40px;text-align:center;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    h2{color:#0f172a;margin:0 0 8px}p{color:#64748b;font-size:15px}</style></head>
    <body><div class="card">
      <div style="font-size:40px;margin-bottom:16px">${emoji}</div>
      <h2>Score: ${score}/10</h2>
      <p>${message}</p>
      <p>Thank you for helping us improve Estimate Nepal.</p>
    </div></body></html>`,
    { headers: { "Content-Type": "text/html", ...NO_CACHE } }
  );
}
