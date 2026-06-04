import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, forbidden, notFound, conflict } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { parsePagination, paginatedResponse } from "@/lib/pagination";

const addSchema = z.object({
  userId: z.string().min(1),
  projectRole: z.enum(["LEAD", "ESTIMATOR", "VIEWER"]).default("ESTIMATOR"),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
    const [members, total] = await Promise.all([
      prisma.projectMember.findMany({
        where: { projectId: params.id },
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.projectMember.count({ where: { projectId: params.id } }),
    ]);

    return NextResponse.json(paginatedResponse(members, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    const caller = await withTenantGuard(token.id as string, project.orgId);
    if (!["OWNER", "ADMIN"].includes(caller.role)) throw forbidden();

    const body = await req.json();
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    // Verify target user is in same org
    const targetUser = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!targetUser || targetUser.orgId !== project.orgId) throw notFound("User");

    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: params.id, userId: parsed.data.userId } },
    });
    if (existing) throw conflict("User is already a member of this project.");

    const member = await prisma.projectMember.create({
      data: {
        projectId: params.id,
        userId: parsed.data.userId,
        projectRole: parsed.data.projectRole,
        assignedBy: token.id as string,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "project.member_added",
      resourceId: project.id,
      meta: { targetUserId: parsed.data.userId },
      ipAddress: ip,
    });

    // Notify the assigned user
    await prisma.notification.create({
      data: {
        userId: parsed.data.userId,
        type: "project.assigned",
        message: `You have been assigned to project: ${project.name}`,
        link: `/dashboard/projects/${project.id}`,
      },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
