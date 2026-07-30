import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { DEFAULT_ASSEMBLY_COLOUR } from "@/lib/cache-constants";

const VALID_SOURCES = ["platform", "org", "all"] as const;
const SEARCH_MAX = 200;
const CATEGORY_MAX = 100;

const groupSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    name: z.string().min(1).max(100).trim(),
    type: z.enum(["LINEAR", "AREA", "VOLUME", "COUNT", "COUNT_BY_DISTANCE", "VERTICAL_WALL_AREA"]).default("LINEAR"),
    colour: z.string().default(DEFAULT_ASSEMBLY_COLOUR),
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
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    await withTenantGuard(token.id as string, token.orgId as string);

    const orgId = token.orgId as string;

    const sp = req.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(sp);
    const search = (sp.get("search") ?? "").trim().slice(0, SEARCH_MAX);
    const category = (sp.get("category") ?? "").trim().slice(0, CATEGORY_MAX);
    const rawSource = sp.get("source") ?? "all";
    const source = VALID_SOURCES.includes(rawSource as any) ? rawSource : "all";

    // Build org-isolation filter separately from the search filter to prevent overwrite
    const orgFilter = {
      OR: [
        ...(source !== "platform" ? [{ orgId }] : []),
        ...(source !== "org" ? [{ orgId: null, isPublic: true }] : []),
      ],
    };

    const where: any = {
      AND: [
        orgFilter,
        ...(search
          ? [{
              OR: [
                { name: { contains: search } },
                { description: { contains: search } },
              ],
            }]
          : []),
        ...(category ? [{ category }] : []),
      ],
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

// POST /api/assemblies — create org assembly (OWNER/ADMIN only)
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const orgId = token.orgId as string;
    const userId = token.id as string;

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    const { name, description, category, groups = [] } = parsed.data;

    // Create assembly + all groups in a single transaction so a partial group failure rolls back everything
    const assembly = await prisma.$transaction(async (tx) => {
      const created = await tx.assembly.create({
        data: { name, description, category, orgId, isPublic: false, createdById: userId },
      });
      await createAssemblyGroupsTx(tx, created.id, groups, null);
      return created;
    });

    appendAuditLog({
      orgId,
      userId,
      event: "assembly.created",
      resourceId: assembly.id,
      meta: { name } as any,
      ipAddress: ip,
    });

    const full = await prisma.assembly.findUnique({
      where: { id: assembly.id },
      include: {
        groups: {
          where: { parentId: null },
          include: { children: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return NextResponse.json(full, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

async function createAssemblyGroupsTx(tx: any, assemblyId: string, groups: any[], parentId: string | null) {
  for (const grp of groups) {
    const created = await tx.assemblyGroup.create({
      data: {
        assemblyId,
        parentId,
        name: grp.name,
        type: grp.type ?? "LINEAR",
        colour: grp.colour ?? DEFAULT_ASSEMBLY_COLOUR,
        lineWidth: grp.lineWidth ?? 2,
        additionalParams: grp.additionalParams ?? undefined,
        rateCode: grp.rateCode ?? null,
        sortOrder: grp.sortOrder ?? 0,
      },
    });
    if (grp.children?.length) {
      await createAssemblyGroupsTx(tx, assemblyId, grp.children, created.id);
    }
  }
}
