import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { invalidateBOQCache } from "@/lib/boq";

const sortSchema = z.object({
  items: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })).min(1).max(500),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const parsed = sortSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

    // Verify every group belongs to this project before bulk-updating
    const ids = parsed.data.items.map(i => i.id);
    const owned = await prisma.takeoffGroup.count({ where: { id: { in: ids }, projectId: params.id } });
    if (owned !== ids.length) return NextResponse.json({ error: "One or more groups not found." }, { status: 404 });

    await prisma.$transaction(
      parsed.data.items.map(({ id, sortOrder }) =>
        prisma.takeoffGroup.update({ where: { id }, data: { sortOrder } })
      )
    );

    invalidateBOQCache(params.id).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}