export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const token = await requireSuperAdmin(req);

    const payments = await prisma.pendingPayment.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(payments);
  } catch (err) {
    return handleApiError(err);
  }
}
