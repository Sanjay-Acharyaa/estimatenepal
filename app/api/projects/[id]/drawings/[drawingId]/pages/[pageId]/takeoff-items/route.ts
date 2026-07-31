import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { computeQuantity, perSegmentEffectiveScale, boundingBoxWeightedScale, MIN_SHAPE_POINTS, type ToolData, type AdditionalParams } from "@/lib/takeoff";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { invalidateBOQCache } from "@/lib/boq";

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

const createSchema = z.object({
  groupId: z.string(),
  label: z.string().min(1).max(200).optional(), // server generates serverLabel from maxSeq; client field is ignored
  toolType: z.enum(["COUNT", "LINEAR", "COUNT_BY_DISTANCE", "AREA", "VOLUME", "VERTICAL_WALL_AREA"]),
  shapeType: z.enum(["RECTANGLE", "POLYLINE", "POLYGON", "CIRCLE", "ARC"]).optional(),
  toolData: z.object({ points: z.array(pointSchema).min(1) }),
  multiplier: z.number().positive().default(1),
  isNegative: z.boolean().default(false),
  sortOrder: z.number().int().optional(),
}).superRefine((val, ctx) => {
  const min = val.shapeType ? (MIN_SHAPE_POINTS[val.shapeType] ?? 1) : 1;
  if (val.toolData.points.length < min) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["toolData", "points"],
      message: `${val.shapeType ?? "shape"} requires at least ${min} point(s), got ${val.toolData.points.length}.`,
    });
  }
  // RECTANGLE must have exactly 4 corners — no more, no fewer.
  if (val.shapeType === "RECTANGLE" && val.toolData.points.length !== 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["toolData", "points"],
      message: `RECTANGLE requires exactly 4 points, got ${val.toolData.points.length}.`,
    });
  }
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

    const { page: pg, limit } = parsePagination(req.nextUrl.searchParams, 2000);
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

    const response = paginatedResponse(items, total, pg, limit);
    if (total > limit && pg === 1) {
      console.warn(`[takeoff-items] Page ${params.pageId} has ${total} items but limit=${limit}; ${total - items.length} items not returned.`);
    }
    return NextResponse.json({ ...response, truncated: total > pg * limit });
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

    if (project.isPricingLocked) return apiError("FORBIDDEN", "Estimate pricing is locked. Unlock it in project settings before making takeoff changes.", 403);

    // Load page with scale + zones for quantity computation
    const page = await prisma.drawingPage.findUnique({
      where: { id: params.pageId },
      include: { scaleZones: true },
    });
    if (!page || page.drawingId !== params.drawingId) throw notFound("Drawing page");

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    // Verify group belongs to this project and is not locked
    const group = await prisma.takeoffGroup.findUnique({ where: { id: parsed.data.groupId } });
    if (!group || group.projectId !== params.id) throw notFound("Takeoff group");
    if (group.isLocked) return apiError("FORBIDDEN", "This layer is locked. Unlock it before adding shapes.", 403);

    // Ensure the submitted toolType matches the group type so rawQuantity is computed with
    // the correct formula. VOLUME groups are exempt — server always overrides to "VOLUME".
    if (group.type !== "VOLUME" && parsed.data.toolType !== group.type) {
      return apiError("VALIDATION_ERROR", `Cannot draw "${parsed.data.toolType}" shapes in a "${group.type}" layer.`, 400);
    }

    // POLYLINE: per-segment length-weighted scale (accurate when crossing zones).
    // Closed area shapes: bounding-box area-weighted scale (handles shapes that straddle zone boundaries).
    // COUNT / point shapes: centroid lookup (single-point, bbox weighting degenerates correctly).
    const pts = parsed.data.toolData.points;
    const scaleResult = parsed.data.shapeType === "POLYLINE"
      ? perSegmentEffectiveScale(pts, page.scale, page.scaleUnit, page.scaleZones)
      : boundingBoxWeightedScale(pts, page.scale, page.scaleUnit, page.scaleZones, parsed.data.shapeType ?? null);
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
      const [last, existingLabels] = await Promise.all([
        tx.takeoffItem.findFirst({
          where: { pageId: params.pageId },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        }),
        // Fetch all labels in the group to find the highest existing sequence number.
        // Using MAX(label suffix) rather than COUNT prevents gaps after deletions.
        tx.takeoffItem.findMany({
          where: { groupId: parsed.data.groupId },
          select: { label: true },
        }),
      ]);
      // Server-assigned label: next after the highest existing number (never reuses deleted slots).
      const maxSeq = existingLabels.reduce((m, i) => {
        const match = i.label.match(/#(\d+)$/);
        return match ? Math.max(m, parseInt(match[1], 10)) : m;
      }, 0);
      const serverLabel = `${group.name.slice(0, 60)} #${maxSeq + 1}`;
      return tx.takeoffItem.create({
        data: {
          pageId: params.pageId,
          groupId: parsed.data.groupId,
          label: serverLabel,
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
    });

    invalidateBOQCache(params.id).catch(() => {});
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
