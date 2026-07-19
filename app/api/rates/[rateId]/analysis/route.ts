import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { computeCompositeRate } from "@/lib/rateAnalysis";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";

const RATE_ID_RE = /^[a-zA-Z0-9_-]+$/;

const analysisSchema = z.object({
  projectId: z.string().min(1),
  materialCost: z.number().min(0).default(0),
  skilledLabour: z.number().min(0).default(0),
  semiSkilledLabour: z.number().min(0).default(0),
  unskilledLabour: z.number().min(0).default(0),
  equipmentCost: z.number().min(0).default(0),
  overheadPct: z.number().min(0).max(100).default(0),
  profitPct: z.number().min(0).max(100).default(0),
  wastagePct: z.number().min(0).max(100).default(0),
  // useComputedRate is accepted from clients but always stored as false.
  // This formula omits contingency, VAT, and Lead & Lift; using it would understate
  // the BOQ rate by 18-25%. Use Resource Analysis → Apply to Base Rate instead.
  useComputedRate: z.boolean().default(false),
});

export async function GET(req: NextRequest, { params }: { params: { rateId: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    if (!RATE_ID_RE.test(params.rateId) || params.rateId.length > 128)
      return apiError("VALIDATION_ERROR", "Invalid rate ID.", 400);

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("VALIDATION_ERROR", "projectId is required.", 400);

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { orgId: true } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const analysis = await prisma.rateAnalysis.findFirst({
      where: { rateItemId: params.rateId, projectId },
    });

    return NextResponse.json(analysis ?? null);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { rateId: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    if (!RATE_ID_RE.test(params.rateId) || params.rateId.length > 128)
      return apiError("VALIDATION_ERROR", "Invalid rate ID.", 400);

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const body = await req.json();
    const parsed = analysisSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const project = await prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { orgId: true },
    });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const rate = await prisma.rateItem.findUnique({ where: { id: params.rateId } });
    if (!rate) throw notFound("Rate item");

    // Only OWNER/ADMIN can edit analysis
    const user = await prisma.user.findUnique({ where: { id: token.id as string } });
    if (!user || (!["OWNER", "ADMIN"].includes(user.role) && !user.isSuperAdmin)) throw forbidden();

    const breakdown = computeCompositeRate(parsed.data);
    const { projectId, useComputedRate: _ignored, ...fields } = parsed.data;

    const analysis = await prisma.rateAnalysis.upsert({
      where: { projectId_rateItemId: { projectId, rateItemId: params.rateId } },
      update: { ...fields, useComputedRate: false, computedRate: breakdown.computedRate },
      create: {
        rateItemId: params.rateId,
        projectId,
        ...fields,
        useComputedRate: false,
        computedRate: breakdown.computedRate,
      },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "rate_analysis.updated",
      resourceId: analysis.id,
      meta: { rateItemId: params.rateId, computedRate: breakdown.computedRate } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ ...analysis, breakdown });
  } catch (err) {
    return handleApiError(err);
  }
}
