import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { handleApiError, unauthorized } from "@/lib/errors";
import { z } from "zod";

const PLAN_PRICES: Record<string, Record<string, number>> = {
  "solo-pro": { monthly: 1499,  annual: 14990 },
  "team-3":   { monthly: 3499,  annual: 34990 },
  "team-5":   { monthly: 5499,  annual: 54990 },
};

const schema = z.object({
  planKey: z.enum(["solo-pro", "team-3", "team-5"]),
  billing: z.enum(["monthly", "annual"]),
  txnId:   z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.sub || !token.email) throw unauthorized();

    const body = await req.json();
    const data = schema.parse(body);

    const expectedAmount = PLAN_PRICES[data.planKey][data.billing];

    await prisma.pendingPayment.create({
      data: {
        email:   token.email as string,
        planKey: data.planKey,
        billing: data.billing,
        amount:  expectedAmount,
        txnId:   data.txnId,
        orgId:   token.orgId as string | undefined,
        status:  "PENDING",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
