import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string;
    if (!orgId) throw forbidden();

    await withTenantGuard(token.id as string, orgId);

    const [members, invites] = await Promise.all([
      prisma.user.findMany({
        where: { orgId },
        select: { id: true, name: true, email: true, role: true, emailVerified: true, lastLoginAt: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.orgInvite.findMany({
        where: { orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ members, invites });
  } catch (err) {
    return handleApiError(err);
  }
}
