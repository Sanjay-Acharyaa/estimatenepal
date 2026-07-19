import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { handleApiError, unauthorized, notFound, apiError } from "@/lib/errors";
import { OverrideStatus } from "@prisma/client";

const proposeSchema = z.object({
  rateItemId: z.string().min(1),
  field: z.enum(["rate", "description"]),
  proposedValue: z.string().min(1),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, orgId: true } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const sp = req.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(sp);
    const VALID_OVERRIDE_STATUSES: OverrideStatus[] = ["PENDING", "APPROVED", "REJECTED"];
    const rawStatus = sp.get("status");
    const statusFilter: OverrideStatus | null =
      rawStatus && (VALID_OVERRIDE_STATUSES as string[]).includes(rawStatus)
        ? (rawStatus as OverrideStatus)
        : null;

    const where = {
      projectId: params.id,
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.bOQOverride.findMany({
        where,
        include: { rateItem: { select: { code: true, description: true, unit: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.bOQOverride.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(data, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, orgId: true } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const body = await req.json();
    const parsed = proposeSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    // Verify the rate item exists and look up the authoritative original value server-side
    const rateItem = await prisma.rateItem.findUnique({ where: { id: parsed.data.rateItemId } });
    if (!rateItem) throw notFound("Rate item");

    // Determine original value from DB — never trust client-supplied original
    const originalValue = parsed.data.field === "rate"
      ? rateItem.baseRate.toString()
      : rateItem.description;

    // Check for existing PENDING override on same field for this project+rateItem
    const existing = await prisma.bOQOverride.findFirst({
      where: { projectId: params.id, rateItemId: parsed.data.rateItemId, field: parsed.data.field, status: "PENDING" },
    });
    if (existing) {
      return apiError("CONFLICT", "A pending override already exists for this field. Wait for it to be reviewed.", 409);
    }

    const override = await prisma.bOQOverride.create({
      data: {
        projectId: params.id,
        rateItemId: parsed.data.rateItemId,
        field: parsed.data.field,
        originalValue,
        proposedValue: parsed.data.proposedValue,
        status: "PENDING",
        submittedBy: token.id as string,
      },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "boq_override.proposed",
      resourceId: override.id,
      meta: { rateItemId: parsed.data.rateItemId, field: parsed.data.field, proposedValue: parsed.data.proposedValue },
      ipAddress: ip,
    });

    // Notify all OWNER/ADMIN members of this org
    const admins = await prisma.user.findMany({
      where: { orgId: project.orgId, role: { in: ["OWNER", "ADMIN"] }, id: { not: token.id as string } },
      select: { id: true },
    });
    if (admins.length > 0) {
      prisma.notification.createMany({
        data: admins.map(a => ({
          userId: a.id,
          type: "override_proposed",
          message: `A BOQ rate override was proposed and needs your review.`,
          link: `/dashboard/projects/${params.id}?tab=estimating`,
        })),
      }).catch((err) => console.error("[boq/overrides] notification failed:", err));
    }

    return NextResponse.json(override, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
