import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";

// GET /api/rate-batches — list all rate books for this org
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    await withTenantGuard(token.id as string, token.orgId as string);

    const batches = await prisma.rateBatch.findMany({
      where: { orgId: token.orgId as string },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      batches.map(b => ({
        id: b.id,
        name: b.name,
        type: b.type,
        fiscalYear: b.fiscalYear ?? "",
        itemCount: b._count.items,
        createdAt: b.createdAt,
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}
