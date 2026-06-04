import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    await withTenantGuard(token.id as string, token.orgId as string);

    const batches = await prisma.rateBatch.findMany({
      where: { orgId: token.orgId as string },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(batches);
  } catch (err) {
    return handleApiError(err);
  }
}
