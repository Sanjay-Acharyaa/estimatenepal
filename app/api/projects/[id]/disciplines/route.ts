import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { getOrCreateDisciplines } from "@/lib/disciplines";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const disciplines = await getOrCreateDisciplines(params.id);
    return NextResponse.json(disciplines);
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));

    const discipline = await prisma.$transaction(async (tx) => {
      const last = await tx.discipline.findFirst({
        where: { projectId: params.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      return tx.discipline.create({
        data: {
          projectId: params.id,
          name: parsed.data.name,
          sortOrder: (last?.sortOrder ?? 0) + 1,
          isPrimary: false,
        },
        include: { _count: { select: { groups: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "discipline.created",
      resourceId: discipline.id,
      meta: { name: parsed.data.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json(discipline, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
