import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden, apiError } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { z } from "zod";

const roleSchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });

// PATCH /api/orgs/members/[userId] — change role (OWNER only)
export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string;
    const caller = await withTenantGuard(token.id as string, orgId);
    if (caller.role !== "OWNER") throw forbidden();
    if (params.userId === token.id) throw apiError("FORBIDDEN", "You cannot change your own role.", 403);

    const body = roleSchema.parse(await req.json());

    const target = await prisma.user.findFirst({ where: { id: params.userId, orgId } });
    if (!target) throw apiError("NOT_FOUND", "Member not found.", 404);
    if (target.role === "OWNER") throw apiError("FORBIDDEN", "Cannot change the owner's role.", 403);

    const updated = await prisma.user.update({
      where: { id: params.userId },
      data: { role: body.role },
      select: { id: true, name: true, email: true, role: true },
    });

    await appendAuditLog({ orgId, userId: token.id as string, event: "member.role_changed",
      resourceId: params.userId, meta: { newRole: body.role }, ipAddress: ip });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/orgs/members/[userId] — remove member (OWNER/ADMIN)
export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string;
    const caller = await withTenantGuard(token.id as string, orgId);
    if (!["OWNER", "ADMIN"].includes(caller.role)) throw forbidden();
    if (params.userId === token.id) throw apiError("FORBIDDEN", "You cannot remove yourself.", 403);

    const target = await prisma.user.findFirst({ where: { id: params.userId, orgId } });
    if (!target) throw apiError("NOT_FOUND", "Member not found.", 404);
    if (target.role === "OWNER") throw apiError("FORBIDDEN", "Cannot remove the account owner.", 403);

    await prisma.user.update({
      where: { id: params.userId },
      data: { orgId: null },
    });

    await appendAuditLog({ orgId, userId: token.id as string, event: "member.removed",
      resourceId: params.userId, meta: { removedEmail: target.email }, ipAddress: ip });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
