import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const scoreStr = searchParams.get("score");
  const userId = searchParams.get("user");
  const key = searchParams.get("key");
  const score = parseInt(scoreStr ?? "", 10);

  if (!userId || isNaN(score) || score < 0 || score > 10) {
    return new NextResponse("Invalid NPS link.", { status: 400 });
  }

  const expected = createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "fallback").update(userId).digest("hex").slice(0, 20);
  if (!key || key !== expected) {
    return new Response("<h2>Invalid or expired link.</h2>", { status: 400, headers: { "Content-Type": "text/html" } });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { npsScore: score },
  }).catch(() => {});

  const emoji = score >= 9 ? "😍" : score >= 7 ? "😊" : score >= 5 ? "😐" : "😕";
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
    { headers: { "Content-Type": "text/html" } }
  );
}
