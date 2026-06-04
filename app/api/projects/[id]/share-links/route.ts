import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";

const createSchema = z.object({
  expiresInDays: z.number().min(1).max(365).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const caller = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(caller.role)) throw forbidden();

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const shareToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 86400000)
      : null;

    const link = await prisma.shareLink.create({
      data: {
        projectId: params.id,
        token: shareToken,
        expiresAt,
        createdBy: token.id as string,
      },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "project.share_link_created",
      resourceId: project.id,
      ipAddress: ip,
    });

    const shareUrl = `${process.env.NEXTAUTH_URL}/share/${shareToken}`;
    return NextResponse.json({ ...link, shareUrl }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
