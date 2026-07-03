import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    const params = req.nextUrl.searchParams;
    const orgId  = params.get("orgId")  ?? undefined;
    const userId = params.get("userId") ?? undefined;
    const event  = params.get("event")  ?? undefined;
    const limit  = Math.min(parseInt(params.get("limit") ?? "100", 10), 500);

    const where = {
      ...(orgId  ? { orgId }  : {}),
      ...(userId ? { userId } : {}),
      ...(event  ? { event: { contains: event } } : {}),
    };

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        event: true,
        resourceId: true,
        meta: true,
        ipAddress: true,
        createdAt: true,
        orgId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Resolve org names in one extra query
    const orgIds = Array.from(new Set(logs.map(l => l.orgId)));
    const orgs = orgIds.length
      ? await prisma.org.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
      : [];
    const orgMap = new Map(orgs.map(o => [o.id, o.name]));

    const enriched = logs.map(l => ({
      ...l,
      orgName: orgMap.get(l.orgId) ?? l.orgId,
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    return handleApiError(err);
  }
}
