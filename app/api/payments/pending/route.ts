import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { handleApiError } from "@/lib/errors";
import { z } from "zod";

const schema = z.object({
  email:   z.string().email(),
  planKey: z.enum(["solo-pro", "team-3", "team-5"]),
  billing: z.enum(["monthly", "annual"]),
  amount:  z.number().int().positive(),
  txnId:   z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = schema.parse(body);
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    await prisma.pendingPayment.create({
      data: {
        email:   data.email,
        planKey: data.planKey,
        billing: data.billing,
        amount:  data.amount,
        txnId:   data.txnId,
        orgId:   token?.orgId as string | undefined,
        status:  "PENDING",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
