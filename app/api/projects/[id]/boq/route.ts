import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { generateBOQ } from "@/lib/boq";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, orgId: true } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const boq = await generateBOQ(params.id);
    return NextResponse.json(boq);
  } catch (err) {
    return handleApiError(err);
  }
}
