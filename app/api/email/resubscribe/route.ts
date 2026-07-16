import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

// H3: Separate HMAC key from unsubscribe so capturing one link can't toggle the other.
function resubKey(userId: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");
  return createHmac("sha256", secret).update(userId + ":resubscribe").digest("hex").slice(0, 20);
}

// GET /api/email/resubscribe?user=X&key=Y
// Self-serve re-subscribe: clears emailUnsubscribedAt so lifecycle emails resume.
// Key is generated from userId + ":resubscribe" — different from the unsubscribe key.
export async function GET(req: NextRequest) {
  // C4: Rate limit to prevent subscription-toggle spam.
  const limited = await checkApiRateLimit(getClientIp(req));
  if (limited) return limited;

  const userId = req.nextUrl.searchParams.get("user");
  const key    = req.nextUrl.searchParams.get("key");

  if (!userId || !key) {
    return new NextResponse("Invalid re-subscribe link.", { status: 400 });
  }

  try {
    const expected = resubKey(userId);
    const keyBuf   = Buffer.from(key);
    const expBuf   = Buffer.from(expected);
    if (keyBuf.length !== expBuf.length || !timingSafeEqual(keyBuf, expBuf)) {
      return new NextResponse("Invalid or expired link.", { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { emailUnsubscribedAt: null },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";
    return NextResponse.redirect(new URL("/resubscribed", baseUrl));
  } catch (err) {
    console.error("[resubscribe] Failed:", (err as Error).message);
    return new NextResponse("Something went wrong. Please try again.", { status: 500 });
  }
}
