import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { withTenantGuard } from "@/lib/auth";

const createSchema = z.object({
  vendor: z.string().min(1).max(200).trim(),
  amount: z.number().min(0),
  discipline: z.string().max(100).trim().optional(),
  notes: z.string().max(2000).trim().optional(),
  status: z.enum(["RECEIVED", "UNDER_REVIEW", "ACCEPTED", "REJECTED"]).default("RECEIVED"),
  validUntil: z.string().datetime().optional(),
});

// GET /api/projects/[id]/quotes
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);

    const [total, items] = await Promise.all([
      prisma.subcontractorQuote.count({ where: { projectId: params.id } }),
      prisma.subcontractorQuote.findMany({
        where: { projectId: params.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json(paginatedResponse(items, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/projects/[id]/quotes
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    const quote = await prisma.subcontractorQuote.create({
      data: {
        projectId: params.id,
        vendor: parsed.data.vendor,
        amount: parsed.data.amount,
        discipline: parsed.data.discipline ?? null,
        notes: parsed.data.notes ?? null,
        status: parsed.data.status,
        validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
      },
    });

    appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "quote.created",
      resourceId: quote.id,
      meta: { vendor: quote.vendor, amount: quote.amount } as any,
      ipAddress: ip,
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
