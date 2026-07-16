import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

function unsubKey(userId: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");
  // Uses the same HMAC key as the unsubscribe route — same user, same link parameters.
  return createHmac("sha256", secret).update(userId + ":unsubscribe").digest("hex").slice(0, 20);
}

// GET /api/email/resubscribe?user=X&key=Y
// Self-serve re-subscribe: clears emailUnsubscribedAt so lifecycle emails resume.
// Uses the same HMAC key as the unsubscribe endpoint — link can come from the unsubscribed page.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user");
  const key    = req.nextUrl.searchParams.get("key");

  if (!userId || !key) {
    return new NextResponse("Invalid re-subscribe link.", { status: 400 });
  }

  try {
    const expected = unsubKey(userId);
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
