import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { computeQuantity, effectiveScale, type ToolData, type AdditionalParams } from "@/lib/takeoff";
import { parsePagination, paginatedResponse } from "@/lib/pagination";

const pointSchema = z.object({ x: z.number(), y: z.number() });

const createSchema = z.object({
  groupId: z.string(),
  label: z.string().min(1).max(200),
  toolType: z.enum(["COUNT", "LINEAR", "COUNT_BY_DISTANCE", "AREA", "VOLUME", "VERTICAL_WALL_AREA"]),
  shapeType: z.enum(["RECTANGLE", "POLYLINE", "POLYGON", "CIRCLE", "ARC"]).optional(),
  toolData: z.object({ points: z.array(pointSchema).min(1) }),
  multiplier: z.number().positive().default(1),
  isNegative: z.boolean().default(false),
  sortOrder: z.number().int().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string; pageId: string } }
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

    const page = await prisma.drawingPage.findUnique({ where: { id: params.pageId } });
    if (!page || page.drawingId !== params.drawingId) throw notFound("Drawing page");

    const { page: pg, limit } = parsePagination(req.nextUrl.searchParams);
    // Exclude orphaned items (groupId: null) — they have no group so cannot be rendered on canvas
    const where = { pageId: params.pageId, groupId: { not: null } };
    const [total, items] = await Promise.all([
      prisma.takeoffItem.count({ where }),
      prisma.takeoffItem.findMany({
        where,
        include: { group: { select: { id: true, name: true, colour: true, type: true, isLocked: true, isVisible: true } } },
        orderBy: { sortOrder: "asc" },
        skip: (pg - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json(paginatedResponse(items, total, pg, limit));
  } catch (err) {
    console.error("[takeoff-items GET]", params, err);
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; drawingId: string; pageId: string } }
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

    // Load page with scale + zones for quantity computation
    const page = await prisma.drawingPage.findUnique({
      where: { id: params.pageId },
      include: { scaleZones: true },
    });
    if (!page || page.drawingId !== params.drawingId) throw notFound("Drawing page");

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    // Verify group belongs to this project
    const group = await prisma.takeoffGroup.findUnique({ where: { id: parsed.data.groupId } });
    if (!group || group.projectId !== params.id) throw notFound("Takeoff group");

    // Resolve scale — reject if none is set, so quantity is never silently 0
    const firstPt = parsed.data.toolData.points[0];
    const scaleResult = effectiveScale(firstPt, page.scale, page.scaleUnit, page.scaleZones);
    if (!scaleResult) {
      return apiError("VALIDATION_ERROR", "No scale is set for this page. Set a drawing scale or add a scale zone before taking off.", 400);
    }
    const { scale: scaleUsed, scaleUnit } = scaleResult;

    // For VOLUME groups always use VOLUME computation regardless of drawing tool used
    const computeTool = group.type === "VOLUME" ? "VOLUME" : parsed.data.toolType;
    const { quantity, rawQuantity, unit } = computeQuantity(
      computeTool as typeof parsed.data.toolType,
      parsed.data.toolData as ToolData,
      scaleUsed,
      scaleUnit,
      parsed.data.multiplier,
      group.additionalParams as AdditionalParams | undefined,
      parsed.data.shapeType ?? null
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = await prisma.$transaction(async (tx) => {
      const last = await tx.takeoffItem.findFirst({
        where: { pageId: params.pageId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      return (tx.takeoffItem.create as any)({
        data: {
          pageId: params.pageId,
          groupId: parsed.data.groupId,
          label: parsed.data.label,
          toolType: parsed.data.toolType,
          shapeType: parsed.data.shapeType,
          toolData: parsed.data.toolData,
          multiplier: parsed.data.multiplier,
          isNegative: parsed.data.isNegative,
          rawQuantity,
          quantity,
          unit,
          scaleUsed,
          sortOrder: parsed.data.sortOrder ?? (last?.sortOrder ?? 0) + 1,
        },
        include: { group: { select: { id: true, name: true, colour: true, type: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
