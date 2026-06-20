import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";
import { parsePagination, paginatedResponse } from "@/lib/pagination";

const createSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(5000).optional(),
  reason: z.string().max(2000).optional(),
  amount: z.number().default(0),
});

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
    const [total, orders] = await Promise.all([
      prisma.changeOrder.count({ where: { projectId: params.id } }),
      prisma.changeOrder.findMany({
        where: { projectId: params.id },
        orderBy: { number: "asc" },
        skip,
        take: limit,
      }),
    ]);
    return NextResponse.json(paginatedResponse(orders, total, page, limit));
  } catch (err) { return handleApiError(err); }
}

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
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const co = await prisma.$transaction(async (tx) => {
      const last = await tx.changeOrder.findFirst({ where: { projectId: params.id }, orderBy: { number: "desc" }, select: { number: true } });
      const number = (last?.number ?? 0) + 1;
      return tx.changeOrder.create({
        data: { ...parsed.data, projectId: params.id, number, requestedBy: token.id as string },
      });
    }, { isolationLevel: "Serializable" });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "change_order.created",
      resourceId: co.id,
      meta: { title: co.title, number: co.number } as any,
      ipAddress: ip,
    });

    return NextResponse.json(co, { status: 201 });
  } catch (err) { return handleApiError(err); }
}
