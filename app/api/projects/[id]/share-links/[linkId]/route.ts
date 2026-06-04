import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; linkId: string } }
) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const caller = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(caller.role)) throw forbidden();

    const link = await prisma.shareLink.findUnique({ where: { id: params.linkId } });
    if (!link || link.projectId !== params.id) throw notFound("Share link");

    await prisma.shareLink.update({ where: { id: params.linkId }, data: { isActive: false } });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "project.share_link_deactivated",
      resourceId: project.id,
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Share link deactivated." });
  } catch (err) {
    return handleApiError(err);
  }
}
