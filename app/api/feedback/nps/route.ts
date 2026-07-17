import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { npsDetractorFollowupEmailHtml } from "@/lib/email";
import { sendEmail } from "@/lib/email";
import { logEmail } from "@/lib/email-log";

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

  // CS1: Throw hard if secret is not configured.
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");

  const expected = createHmac("sha256", secret).update(userId).digest("hex").slice(0, 20);

  // C1: Timing-safe comparison prevents HMAC oracle attacks.
  if (!key || key.length !== expected.length || !timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    return new NextResponse("Invalid or expired link.", { status: 400, headers: NO_CACHE });
  }

  // CS2: First-click-wins — only update if npsScore has not been recorded yet.
  const updateResult = await prisma.user.updateMany({
    where: { id: userId, npsScore: null },
    data: { npsScore: score },
  }).catch((err: Error) => { console.error("[feedback/nps] DB update failed:", err.message); return { count: 0 }; });

  // Fire NPS detractor follow-up email for scores 0–6, only on first click
  if (score <= 6 && updateResult.count > 0) {
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
      .then(user => {
        if (!user?.email || !user?.name) return;
        const subject = `You gave us a ${score} — can you tell us more?`;
        const html = npsDetractorFollowupEmailHtml(user.name, score);
        return sendEmail({ to: user.email, subject, html })
          .then(emailId => logEmail({
            recipientEmail: user.email!,
            recipientName: user.name!,
            emailType: "nps_followup",
            subject,
            status: "sent",
            resendEmailId: emailId,
          }))
          .catch((err: Error) => console.error("[feedback/nps] Detractor follow-up failed:", err.message));
      })
      .catch((err: Error) => console.error("[feedback/nps] User lookup failed:", err.message));
  }

  // H2/L2: Redirect to a proper Next.js page instead of returning inline HTML.
  const base = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";
  const dest = new URL("/feedback/thanks", base);
  dest.searchParams.set("type", "nps");
  dest.searchParams.set("score", String(score));
  return NextResponse.redirect(dest, { headers: NO_CACHE });
}
