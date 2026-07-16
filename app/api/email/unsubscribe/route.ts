import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

function unsubKey(userId: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");
  return createHmac("sha256", secret).update(userId + ":unsubscribe").digest("hex").slice(0, 20);
}

// GET /api/email/unsubscribe?user=X&key=Y
// One-click unsubscribe from marketing lifecycle emails.
// No session required — link is included in email footers.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user");
  const key    = req.nextUrl.searchParams.get("key");

  if (!userId || !key) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  try {
    const expected = unsubKey(userId);
    // CS3: Use timing-safe comparison to prevent timing-attack oracle on HMAC key.
    const keyBuf = Buffer.from(key);
    const expBuf = Buffer.from(expected);
    if (keyBuf.length !== expBuf.length || !timingSafeEqual(keyBuf, expBuf)) {
      return new NextResponse("Invalid unsubscribe link.", { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { emailUnsubscribedAt: new Date() },
    });

    // Redirect to confirmation page — pass user+key so the page can show a re-subscribe link.
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://estimatenepal.com";
    const dest = new URL("/unsubscribed", baseUrl);
    dest.searchParams.set("user", userId);
    dest.searchParams.set("key", key);
    return NextResponse.redirect(dest);
  } catch (err) {
    console.error("[unsubscribe] Failed:", (err as Error).message);
    return new NextResponse("Something went wrong. Please try again.", { status: 500 });
  }
}
