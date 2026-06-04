import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit } from "@/lib/security";

const updateSchema = z.object({
  name: z.string().min(1).max(150).trim().optional(),
  description: z.string().max(1000).trim().optional(),
  category: z.string().max(100).trim().optional(),
});

async function getAssemblyOrThrow(id: string) {
  const a = await prisma.assembly.findUnique({
    where: { id },
    include: {
      groups: {
        where: { parentId: null },
        include: { children: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!a) throw notFound("Assembly");
  return a;
}

// GET /api/assemblies/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;

    const assembly = await getAssemblyOrThrow(params.id);
    if (assembly.orgId && assembly.orgId !== orgId) throw forbidden();

    return NextResponse.json(assembly);
  } catch (err) {
    return handleApiError(err);
  }
}

// PUT /api/assemblies/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    const role = token.role as string;

    const assembly = await getAssemblyOrThrow(params.id);
    if (!assembly.orgId || assembly.orgId !== orgId) throw forbidden();
    if (!["OWNER", "ADMIN"].includes(role)) throw forbidden();

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.assembly.update({ where: { id: params.id }, data: parsed.data });

    await appendAuditLog({
      orgId: orgId ?? "SYSTEM",
      userId: token.id as string,
      event: "assembly.updated",
      resourceId: params.id,
      meta: parsed.data as any,
      ipAddress: ip,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/assemblies/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    const orgId = token.orgId as string | null;
    const role = token.role as string;

    const assembly = await getAssemblyOrThrow(params.id);
    if (!assembly.orgId || assembly.orgId !== orgId) throw forbidden();
    if (!["OWNER", "ADMIN"].includes(role)) throw forbidden();

    await prisma.assembly.delete({ where: { id: params.id } });

    await appendAuditLog({
      orgId: orgId ?? "SYSTEM",
      userId: token.id as string,
      event: "assembly.deleted",
      resourceId: params.id,
      meta: { name: assembly.name } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ message: "Deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}
