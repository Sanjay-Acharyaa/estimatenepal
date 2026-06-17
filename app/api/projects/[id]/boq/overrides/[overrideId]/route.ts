import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, unauthorized, notFound, forbidden, apiError } from "@/lib/errors";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  approvedValue: z.string().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; overrideId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, orgId: true },
    });
    if (!project) throw notFound("Project");

    const user = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const override = await prisma.bOQOverride.findUnique({ where: { id: params.overrideId } });
    if (!override || override.projectId !== params.id) throw notFound("Override");
    if (override.status !== "PENDING") {
      return apiError("CONFLICT", "Override has already been reviewed.", 409);
    }

    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const newStatus = parsed.data.action === "approve" ? "APPROVED" : "REJECTED";
    const approvedValue =
      parsed.data.action === "approve"
        ? (parsed.data.approvedValue ?? override.proposedValue)
        : null;

    const updated = await prisma.bOQOverride.update({
      where: { id: params.overrideId },
      data: {
        status: newStatus,
        approvedValue,
        reviewedBy: token.id as string,
        resolvedAt: new Date(),
      },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: `boq_override.${newStatus.toLowerCase()}`,
      resourceId: override.id,
      meta: { action: parsed.data.action, approvedValue },
      ipAddress: ip,
    });

    // Notify the member who proposed the override
    if (override.submittedBy && override.submittedBy !== token.id as string) {
      prisma.notification.create({
        data: {
          userId: override.submittedBy,
          type: "override_reviewed",
          message: `Your BOQ rate override was ${newStatus.toLowerCase()}.`,
          link: `/dashboard/projects/${params.id}?tab=estimating`,
        },
      }).catch((err) => console.error("[boq/overrides/review] notification failed:", err));
    }

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
