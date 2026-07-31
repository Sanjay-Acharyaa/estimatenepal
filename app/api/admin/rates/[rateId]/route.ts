export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { invalidateBOQCache } from "@/lib/boq";

async function requireSuperAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) throw unauthorized();
  if (!token.isSuperAdmin) throw forbidden();
  const user = await prisma.user.findUnique({
    where: { id: token.id as string },
    select: { isSuperAdmin: true },
  });
  if (!user?.isSuperAdmin) throw forbidden();
  return token;
}

const updateSchema = z.object({
  code: z.string().min(1).max(50).trim().optional(),
  description: z.string().min(1).trim().optional(),
  unit: z.string().min(1).max(50).trim().optional(),
  baseRate: z.number().min(0).optional(),
  fiscalYear: z.string().min(4).max(10).trim().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { rateId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);
    const rate = await prisma.rateItem.findUnique({
      where: { id: params.rateId },
      include: { districtRates: true },
    });
    if (!rate || rate.source !== "DUDBC") throw notFound("Rate");
    return NextResponse.json(rate);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { rateId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const rate = await prisma.rateItem.findUnique({ where: { id: params.rateId } });
    if (!rate || rate.source !== "DUDBC") throw notFound("Rate");
    if (rate.isPublished) return apiError("FORBIDDEN", "Published rates cannot be edited.", 403);

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    const updated = await prisma.rateItem.update({
      where: { id: params.rateId },
      data: parsed.data,
    });

    appendAuditLog({
      orgId: "SYSTEM",
      userId: token!.id as string,
      event: "dudbc_rate.updated",
      resourceId: params.rateId,
      meta: parsed.data as any,
      ipAddress: getClientIp(req),
    });

    // Invalidate BOQ caches for all projects that link to this rate item
    prisma.takeoffGroup.findMany({
      where: { rateItemId: rate.id },
      select: { projectId: true },
      distinct: ["projectId"],
    }).then(groups => Promise.all(groups.map(g => invalidateBOQCache(g.projectId)))).catch(() => {});

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { rateId: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const rate = await prisma.rateItem.findUnique({ where: { id: params.rateId } });
    if (!rate || rate.source !== "DUDBC") throw notFound("Rate");
    if (rate.isPublished) return apiError("FORBIDDEN", "Published rates cannot be deleted.", 403);

    // Collect affected groups before deletion (SetNull fires on delete, so query first).
    const affectedGroups = await prisma.takeoffGroup.findMany({
      where: { rateItemId: rate.id },
      select: { projectId: true },
    });

    if (affectedGroups.length > 0) {
      // Build per-project group count so the notification message is precise.
      const groupCountByProject: Record<string, number> = {};
      for (const g of affectedGroups) {
        groupCountByProject[g.projectId] = (groupCountByProject[g.projectId] ?? 0) + 1;
      }
      const affectedProjectIds = Object.keys(groupCountByProject);

      // Fetch project names and LEAD/ESTIMATOR members in parallel (before delete).
      const [affectedProjects, affectedMembers] = await Promise.all([
        prisma.project.findMany({
          where: { id: { in: affectedProjectIds } },
          select: { id: true, name: true },
        }),
        prisma.projectMember.findMany({
          where: { projectId: { in: affectedProjectIds }, projectRole: { in: ["LEAD", "ESTIMATOR"] } },
          select: { userId: true, projectId: true },
        }),
      ]);
      const projectNameMap = Object.fromEntries(affectedProjects.map(p => [p.id, p.name]));

      await prisma.rateItem.delete({ where: { id: params.rateId } });

      appendAuditLog({
        orgId: "SYSTEM",
        userId: token!.id as string,
        event: "dudbc_rate.deleted",
        resourceId: params.rateId,
        meta: { code: rate.code, fiscalYear: rate.fiscalYear, affectedProjectIds } as any,
        ipAddress: getClientIp(req),
      });

      // Notify affected estimators/leads so they know to re-link the rate.
      if (affectedMembers.length > 0) {
        prisma.notification.createMany({
          data: affectedMembers.map(m => ({
            userId: m.userId,
            type: "rate_link_nulled",
            message: `Rate "${rate.code}" was deleted. ${groupCountByProject[m.projectId] ?? 1} layer(s) in "${projectNameMap[m.projectId] ?? "your project"}" lost their rate link and need to be re-linked.`,
            link: `/dashboard/projects/${m.projectId}?tab=estimating`,
          })),
        }).catch(err => console.error("[rates/delete] notification failed:", err));
      }

      Promise.all(affectedProjectIds.map(id => invalidateBOQCache(id))).catch(() => {});
    } else {
      // No layers were linked — straightforward delete, no notifications needed.
      await prisma.rateItem.delete({ where: { id: params.rateId } });

      appendAuditLog({
        orgId: "SYSTEM",
        userId: token!.id as string,
        event: "dudbc_rate.deleted",
        resourceId: params.rateId,
        meta: { code: rate.code, fiscalYear: rate.fiscalYear, affectedProjectIds: [] } as any,
        ipAddress: getClientIp(req),
      });
    }

    return NextResponse.json({ message: "Deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}