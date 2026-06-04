import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized } from "@/lib/errors";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit } from "@/lib/security";

const groupSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    name: z.string().min(1).max(100).trim(),
    type: z.enum(["LINEAR", "AREA", "VOLUME", "COUNT", "COUNT_BY_DISTANCE", "VERTICAL_WALL_AREA"]).default("LINEAR"),
    colour: z.string().default("#3B82F6"),
    lineWidth: z.number().int().min(1).max(20).default(2),
    additionalParams: z.any().optional(),
    rateCode: z.string().max(50).optional(),
    sortOrder: z.number().int().default(0),
    children: z.array(z.lazy(() => groupSchema)).optional(),
  })
);

const createSchema = z.object({
  name: z.string().min(1).max(150).trim(),
  description: z.string().max(1000).trim().optional(),
  category: z.string().max(100).trim().optional(),
  groups: z.array(groupSchema).optional(),
});

// GET /api/assemblies?page=&limit=&search=&category=&source=platform|org|all
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const orgId = token.orgId as string | null;

    const sp = req.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(sp);
    const search = sp.get("search")?.trim() ?? "";
    const category = sp.get("category")?.trim() ?? "";
    const source = sp.get("source") ?? "all"; // platform | org | all

    const where: any = {
      OR: [
        ...(source !== "platform" && orgId ? [{ orgId }] : []),
        ...(source !== "org" ? [{ orgId: null, isPublic: true }] : []),
      ],
      ...(search ? {
        OR: [
          { name: { contains: search } },
          { description: { contains: search } },
        ],
      } : {}),
      ...(category ? { category } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.assembly.count({ where }),
      prisma.assembly.findMany({
        where,
        include: {
          groups: {
            where: { parentId: null },
            include: { children: { orderBy: { sortOrder: "asc" } } },
            orderBy: { sortOrder: "asc" },
          },
          _count: { select: { groups: true } },
        },
        orderBy: [{ orgId: "asc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json(paginatedResponse(items, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/assemblies — create org assembly
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    const userId = token.id as string;

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const { name, description, category, groups = [] } = parsed.data;

    const assembly = await prisma.assembly.create({
      data: {
        name,
        description,
        category,
        orgId,
        isPublic: false,
        createdById: userId,
      },
    });

    // Create groups recursively
    await createAssemblyGroups(assembly.id, groups, null);

    await appendAuditLog({
      orgId: orgId ?? "SYSTEM",
      userId: userId,
      event: "assembly.created",
      resourceId: assembly.id,
      meta: { name } as any,
      ipAddress: ip,
    });

    const full = await prisma.assembly.findUnique({
      where: { id: assembly.id },
      include: { groups: { where: { parentId: null }, include: { children: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json(full, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

async function createAssemblyGroups(assemblyId: string, groups: any[], parentId: string | null) {
  for (const grp of groups) {
    const created = await prisma.assemblyGroup.create({
      data: {
        assemblyId,
        parentId,
        name: grp.name,
        type: grp.type ?? "LINEAR",
        colour: grp.colour ?? "#3B82F6",
        lineWidth: grp.lineWidth ?? 2,
        additionalParams: grp.additionalParams ?? undefined,
        rateCode: grp.rateCode ?? null,
        sortOrder: grp.sortOrder ?? 0,
      },
    });
    if (grp.children?.length) {
      await createAssemblyGroups(assemblyId, grp.children, created.id);
    }
  }
}
