import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1).max(150),
  type: z.enum(["COUNT", "LINEAR", "COUNT_BY_DISTANCE", "AREA", "VOLUME", "VERTICAL_WALL_AREA"]).default("LINEAR"),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#3B82F6"),
  lineWidth: z.number().int().min(1).max(10).default(2),
  tag: z.string().max(200).optional(),
  multiplier: z.number().positive().default(1),
  disciplineId: z.string().nullish(),
  sortOrder: z.number().int().optional(),
  parentId: z.string().nullish(),
  rateItemId: z.string().nullable().optional(),
  preamble: z.string().max(1000).nullable().optional(),
  countShape: z.enum(["circle", "square", "triangle", "diamond", "cross", "star"]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const groups = await prisma.takeoffGroup.findMany({
      where: { projectId: params.id },
      include: {
        discipline: { select: { id: true, name: true } },
        _count: { select: { items: true } },
        rateItem: { select: { code: true, source: true, _count: { select: { analysisLines: true } } } },
        assembly: { select: { id: true, name: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(groups);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    if (project.isPricingLocked) return apiError("FORBIDDEN", "Estimate pricing is locked. Unlock it in project settings before making takeoff changes.", 403);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    // Validate that the requested rateItemId is accessible to this org (public DUDBC item OR
    // owned by the same org). Prevents a tenant from linking another org's private rate.
    if (parsed.data.rateItemId) {
      const rateItem = await prisma.rateItem.findUnique({
        where: { id: parsed.data.rateItemId },
        select: { orgId: true },
      });
      if (!rateItem || (rateItem.orgId !== null && rateItem.orgId !== project.orgId)) {
        return apiError("NOT_FOUND", "Rate item not found.", 404);
      }
    }

    const group = await prisma.$transaction(async (tx) => {
      if (parsed.data.parentId) {
        const parent = await tx.takeoffGroup.findUnique({
          where: { id: parsed.data.parentId },
          select: { projectId: true, parentId: true, disciplineId: true },
        });
        if (!parent || parent.projectId !== params.id) {
          throw apiError("NOT_FOUND", "Parent group not found.", 404);
        }
        if (parent.parentId !== null) {
          throw apiError("VALIDATION_ERROR", "Groups can only be nested one level deep.", 400);
        }
        if (parent.disciplineId !== parsed.data.disciplineId) {
          throw apiError("VALIDATION_ERROR", "Layer discipline must match its parent category.", 400);
        }
      }
      const last = await tx.takeoffGroup.findFirst({
        where: {
          projectId: params.id,
          parentId: parsed.data.parentId ?? null,
        },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      return tx.takeoffGroup.create({
        data: {
          projectId: params.id,
          name: parsed.data.name,
          type: parsed.data.type,
          colour: parsed.data.colour,
          lineWidth: parsed.data.lineWidth,
          tag: parsed.data.tag,
          multiplier: parsed.data.multiplier,
          disciplineId: parsed.data.disciplineId,
          parentId: parsed.data.parentId ?? null,
          sortOrder: parsed.data.sortOrder ?? (last?.sortOrder ?? 0) + 1,
          rateItemId: parsed.data.rateItemId ?? null,
          preamble: parsed.data.preamble ?? null,
          ...(parsed.data.countShape ? { additionalParams: { countShape: parsed.data.countShape } } : {}),
        },
        include: { _count: { select: { items: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "takeoff_group.created",
      resourceId: group.id,
      meta: { name: group.name, type: group.type } as any,
      ipAddress: ip,
    });

    return NextResponse.json(group, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
