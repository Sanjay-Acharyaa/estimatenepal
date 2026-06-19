import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { handleApiError, apiError, unauthorized } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const schema = z.object({
  code: z.string().min(1).max(50),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const orgId = token.orgId as string | null;
    if (!orgId) {
      return apiError("FORBIDDEN", "No organisation associated with your account.", 403);
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400);
    }

    // Normalise: uppercase, strip whitespace — users often copy/paste with stray spaces
    const code = parsed.data.code.trim().toUpperCase();

    // Fetch coupon to get durationDays and check it exists
    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) {
      // Generic — don't confirm whether code exists or was used
      return apiError("NOT_FOUND", "Invalid or already used coupon code.", 404);
    }
    if (coupon.redeemedAt) {
      return apiError("CONFLICT", "Invalid or already used coupon code.", 409);
    }

    const now = new Date();

    // Load current org trialEndsAt to compute the extension base
    const org = await prisma.org.findUnique({
      where: { id: orgId },
      select: { trialEndsAt: true },
    });

    // Extend from whichever is later: current trial end (if still future) or now
    const base = org?.trialEndsAt && org.trialEndsAt > now ? org.trialEndsAt : now;
    const newTrialEndsAt = new Date(base.getTime() + coupon.durationDays * 24 * 60 * 60 * 1000);

    // Atomic redemption — updateMany accepts non-unique filters so the WHERE redeemedAt=NULL
    // acts as an optimistic lock: if a concurrent request already redeemed the coupon the
    // count will be 0 and we return 409 without touching the org row.
    const redeemed = await prisma.$transaction(async (tx) => {
      const updated = await tx.coupon.updateMany({
        where: { code, redeemedAt: null },
        data: { redeemedByOrg: orgId, redeemedAt: now },
      });
      if (updated.count === 0) return false;

      await tx.org.update({
        where: { id: orgId },
        data: { trialEndsAt: newTrialEndsAt },
      });
      return true;
    });

    if (!redeemed) {
      return apiError("CONFLICT", "Invalid or already used coupon code.", 409);
    }

    // Invalidate the user's current JWT so the next sign-in picks up the updated trialEndsAt.
    // Reuses the pw_changed mechanism — same effect: existing session is treated as expired.
    await redis.set(
      `pw_changed:${token.id as string}`,
      Date.now().toString(),
      "EX",
      7 * 24 * 60 * 60,
    );

    return NextResponse.json({
      message: `Coupon applied — your access has been extended by ${coupon.durationDays} day(s). Please sign in again to continue.`,
      durationDays: coupon.durationDays,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
