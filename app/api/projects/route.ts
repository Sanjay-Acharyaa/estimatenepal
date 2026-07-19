import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden } from "@/lib/errors";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { withTenantGuard } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";
import { RATE_DEFAULTS, VAT_DEFAULT_RATE, TDS_DEFAULT_RATE } from "@/lib/rate-defaults";

const VALID_SORT_FIELDS = ["name", "createdAt", "bidDueDate", "status", "estimatedValue"] as const;
type SortField = typeof VALID_SORT_FIELDS[number];

const VALID_STATUSES = ["ESTIMATING","BID_SUBMITTED","ACCEPTED","IN_PROGRESS","COMPLETE","LOST","ARCHIVED"] as const;
type ProjectStatus = typeof VALID_STATUSES[number];

const createSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  clientName: z.string().max(200).optional(),
  clientCompany: z.string().max(200).optional(),
  bidDueDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  estimatedValue: z.number().min(0).optional(),
  district: z.string().max(100).optional(),
  seismicZone: z.string().max(50).optional(),
  unitSystem: z.enum(["METRIC", "IMPERIAL"]).default("METRIC"),
  dateFormat: z.enum(["AD", "BS"]).default("AD"),
  contingencyPct: z.number().min(0).max(100).optional(),
  provisionalSum: z.number().min(0).optional(),
  vatEnabled: z.boolean().default(true),
  vatRate: z.number().min(0).max(100).default(VAT_DEFAULT_RATE),
  tdsEnabled: z.boolean().default(false),
  tdsRate: z.number().min(0).max(100).default(TDS_DEFAULT_RATE),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  squareFootage: z.number().positive().nullable().optional(),
  office: z.string().max(200).optional(),
  isPricingLocked: z.boolean().default(false),
  projectNumber: z.string().max(100).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.orgId) throw unauthorized();

    // Tenant guard: verify user belongs to the org they're querying (Redis-cached)
    await withTenantGuard(token.id as string, token.orgId as string);

    const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
    const search = (req.nextUrl.searchParams.get("search") ?? "").slice(0, 200);
    // Whitelist status — reject unknown values rather than passing raw strings to Prisma
    const rawStatus = req.nextUrl.searchParams.get("status") ?? "";
    const status: ProjectStatus | "" = VALID_STATUSES.includes(rawStatus as ProjectStatus) ? rawStatus as ProjectStatus : "";

    // Whitelist sort fields to prevent arbitrary column access
    const rawSort = req.nextUrl.searchParams.get("sort") ?? "createdAt";
    const sortBy: SortField = VALID_SORT_FIELDS.includes(rawSort as SortField)
      ? (rawSort as SortField)
      : "createdAt";
    const sortDir = req.nextUrl.searchParams.get("dir") === "asc" ? "asc" : "desc";

    // Role is in the JWT — no extra DB query needed
    const isMember = token.role === "MEMBER";
    const hasExplicitAssignments = isMember
      ? (await prisma.projectMember.count({ where: { userId: token.id as string } })) > 0
      : false;

    const where: any = {
      orgId: token.orgId as string,
      ...(search && { name: { contains: search } }),
      ...(status && { status }),
      ...(hasExplicitAssignments && {
        members: { some: { userId: token.id as string } },
      }),
    };

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortDir },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          _count: { select: { drawings: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(projects, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.orgId) throw unauthorized();

    const caller = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(caller.role)) throw forbidden();

    // Superadmins bypass all plan limits
    if (!token.isSuperAdmin) {
      // Free plan: 1 project limit
      const org = await prisma.org.findUnique({ where: { id: token.orgId as string }, select: { plan: true } });
      if (org?.plan === "FREE") {
        const existing = await prisma.project.count({ where: { orgId: token.orgId as string } });
        if (existing >= 1) {
          return apiError("PLAN_LIMIT", "Free plan is limited to 1 project. Upgrade to create more.", 403);
        }
      }
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());
    }

    const project = await prisma.project.create({
      data: { ...parsed.data, orgId: token.orgId as string },
    });

    // Detect double-contingency: project-level + org rate-settings level both > 0
    let _contingencyWarning: string | null = null;
    const projectContingency = parsed.data.contingencyPct ?? 0;
    if (projectContingency > 0) {
      const orgSettings = await prisma.orgRateSettings.findUnique({
        where: { orgId: token.orgId as string },
        select: { contingencyPct: true },
      });
      const rateContingency = orgSettings?.contingencyPct ?? RATE_DEFAULTS.contingencyPct;
      if (rateContingency > 0) {
        const compounded = ((1 + projectContingency / 100) * (1 + rateContingency / 100) - 1) * 100;
        _contingencyWarning = `Project contingency is ${projectContingency}% and the organisation's rate settings also include ${rateContingency}% embedded in resource-based rates. These will compound to approximately ${compounded.toFixed(1)}% total. Set one to 0 to avoid double-counting in bids.`;
      }
    }

    const DEFAULT_FOLDERS = ["General", "Architectural", "Structural", "Civil", "MEP"];
    await prisma.drawingFolder.createMany({
      data: DEFAULT_FOLDERS.map((name, i) => ({ projectId: project.id, name, sortOrder: i })),
    });

    await appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "project.created",
      resourceId: project.id,
      meta: { name: project.name },
      ipAddress: ip,
    });

    // Fire-and-forget — notification fan-out must not block the project creation response
    prisma.user.findMany({
      where: { orgId: token.orgId as string, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true },
    }).then((admins) => {
      if (admins.length === 0) return;
      return prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "project.created",
          message: `New project created: ${project.name}`,
          link: `/dashboard/projects/${project.id}`,
        })),
      });
    }).catch((err) => {
      console.error("[projects] Failed to create project notifications:", err);
    });

    trackEvent("project_created", { orgId: token.orgId as string, userId: token.id as string, meta: { projectId: project.id } });

    return NextResponse.json(
      _contingencyWarning ? { ...project, _contingencyWarning } : project,
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
