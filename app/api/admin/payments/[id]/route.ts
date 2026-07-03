import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { z } from "zod";

const schema = z.object({
  status:    z.enum(["PENDING", "VERIFIED", "REJECTED"]),
  adminNote: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    const body = schema.parse(await req.json());
    const payment = await prisma.pendingPayment.update({
      where: { id: params.id },
      data:  { status: body.status, adminNote: body.adminNote },
    });

    return NextResponse.json(payment);
  } catch (err) {
    return handleApiError(err);
  }
}
