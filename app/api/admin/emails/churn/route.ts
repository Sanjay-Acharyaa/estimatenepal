import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

// GET /api/admin/emails/churn — orgs that gave churn feedback
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.isSuperAdmin) throw forbidden();

    const orgs = await prisma.org.findMany({
      where: { churnReason: { not: null } },
      orderBy: { trialEndsAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        churnReason: true,
        trialEndsAt: true,
        dataWipedAt: true,
        createdAt: true,
        users: {
          where: { role: "OWNER" },
          select: { email: true, name: true, lastLoginAt: true },
          take: 1,
        },
        _count: { select: { projects: true } },
      },
    });

    const result = orgs.map((o) => {
      const owner = o.users[0];
      // C5: "Days used" = days from org creation to last owner login (true engagement window)
      // Falls back to days-to-expiry only when lastLoginAt is unavailable.
      const daysUsed = owner?.lastLoginAt
        ? Math.max(0, Math.round((owner.lastLoginAt.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24)))
        : o.trialEndsAt
          ? Math.round((o.trialEndsAt.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24))
          : null;

      return {
        orgId:        o.id,
        orgName:      o.name,
        ownerEmail:   owner?.email ?? null,
        ownerName:    owner?.name ?? null,
        churnReason:  o.churnReason,
        trialEndsAt:  o.trialEndsAt,
        lastLoginAt:  owner?.lastLoginAt ?? null,
        projectCount: o._count.projects,
        dataWipedAt:  o.dataWipedAt,
        daysTrialUsed: daysUsed,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
