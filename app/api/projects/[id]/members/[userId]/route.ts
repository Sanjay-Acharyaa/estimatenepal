import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const caller = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(caller.role)) throw forbidden();

    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: params.id, userId: params.userId } },
    });
    if (!member) throw notFound("Member");

    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: params.id, userId: params.userId } },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "project.member_removed",
      resourceId: project.id,
      meta: { targetUserId: params.userId },
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Member removed." });
  } catch (err) {
    return handleApiError(err);
  }
}
