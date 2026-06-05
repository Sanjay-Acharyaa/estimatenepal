import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit } from "@/lib/security";
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
        rateItem: { select: { code: true, source: true } },
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
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const last = await prisma.takeoffGroup.findFirst({
      where: { projectId: params.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const group = await prisma.takeoffGroup.create({
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

    await appendAuditLog({
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
