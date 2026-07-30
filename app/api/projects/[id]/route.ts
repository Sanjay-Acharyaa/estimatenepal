import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { invalidateBOQCache } from "@/lib/boq";

const updateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  district: z.string().max(100).nullable().optional(),
  seismicZone: z.string().max(50).nullable().optional(),
  unitSystem: z.enum(["METRIC", "IMPERIAL"]).optional(),
  dateFormat: z.enum(["AD", "BS"]).optional(),
  contingencyPct: z.number().min(0).max(100).nullable().optional(),
  provisionalSum: z.number().min(0).nullable().optional(),
  vatEnabled: z.boolean().optional(),
  vatRate: z.number().min(0).max(100).optional(),
  tdsEnabled: z.boolean().optional(),
  tdsRate: z.number().min(0).max(100).optional(),
  status: z.enum(["ESTIMATING","BID_SUBMITTED","ACCEPTED","IN_PROGRESS","COMPLETE","LOST","ARCHIVED"]).optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  squareFootage: z.number().positive().nullable().optional(),
  office: z.string().max(200).nullable().optional(),
  isPricingLocked: z.boolean().optional(),
  dueTime: z.string().datetime().nullable().optional(),
  projectNumber: z.string().max(100).nullable().optional(),
  clientName: z.string().max(200).nullable().optional(),
  clientCompany: z.string().max(200).nullable().optional(),
  bidDueDate: z.string().datetime().nullable().optional(),
  scopeOfWork: z.string().max(10000).nullable().optional(),
  exportConfig: z.record(z.string(), z.boolean()).optional(),
});

async function getProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw notFound("Project");
  return project;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    // Fetch orgId only first so tenant guard runs before full member/share data is loaded
    const slim = await prisma.project.findUnique({ where: { id: params.id }, select: { orgId: true } });
    if (!slim) throw notFound("Project");
    await withTenantGuard(token.id as string, slim.orgId);

    const full = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        },
        shareLinks: { where: { isActive: true }, orderBy: { createdAt: "desc" } },
        _count: { select: { drawings: true, disciplines: true } },
      },
    });
    if (!full) throw notFound("Project");

    return NextResponse.json(full);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await getProject(params.id);
    const caller = await withTenantGuard(token.id as string, project.orgId);

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    // Restricted fields — only OWNER or ADMIN may change them
    const RESTRICTED_FIELDS = ["status", "isPricingLocked", "estimatedValue", "vatRate", "tdsRate"] as const;
    const isPrivileged = ["OWNER", "ADMIN"].includes(caller.role);
    if (!isPrivileged && RESTRICTED_FIELDS.some((f) => (parsed.data as Record<string, unknown>)[f] !== undefined)) {
      throw forbidden();
    }

    const updated = await prisma.project.update({ where: { id: params.id }, data: parsed.data });

    appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "project.updated",
      resourceId: project.id,
      meta: parsed.data as Prisma.InputJsonValue,
      ipAddress: ip,
    });

    // Invalidate cached BOQ whenever any financial field that affects the BOQ total changes.
    const BOQ_AFFECTING_FIELDS = ["vatRate", "vatEnabled", "tdsRate", "tdsEnabled", "contingencyPct", "provisionalSum"] as const;
    if (BOQ_AFFECTING_FIELDS.some(f => (parsed.data as Record<string, unknown>)[f] !== undefined)) {
      invalidateBOQCache(params.id).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await getProject(params.id);
    const user = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    // Soft-delete by archiving
    await prisma.project.update({ where: { id: params.id }, data: { status: "ARCHIVED" } });

    appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "project.archived",
      resourceId: project.id,
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Project archived." });
  } catch (err) {
    return handleApiError(err);
  }
}
