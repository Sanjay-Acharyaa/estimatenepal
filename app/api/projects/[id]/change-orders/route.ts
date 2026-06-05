import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit } from "@/lib/security";

const createSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(5000).optional(),
  reason: z.string().max(2000).optional(),
  amount: z.number().default(0),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const orders = await prisma.changeOrder.findMany({
      where: { projectId: params.id },
      orderBy: { number: "asc" },
    });
    return NextResponse.json(orders);
  } catch (err) { return handleApiError(err); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

    const last = await prisma.changeOrder.findFirst({ where: { projectId: params.id }, orderBy: { number: "desc" }, select: { number: true } });
    const number = (last?.number ?? 0) + 1;

    const co = await prisma.changeOrder.create({
      data: { ...parsed.data, projectId: params.id, number, requestedBy: token.id as string },
    });
    return NextResponse.json(co, { status: 201 });
  } catch (err) { return handleApiError(err); }
}
