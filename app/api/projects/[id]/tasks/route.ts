import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";
import { parsePagination, paginatedResponse } from "@/lib/pagination";

const createSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  description: z.string().max(2000).optional(),
  assignedToId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    const project = await prisma.project.findUnique({ where: { id: params.id } });
    if (!project) throw notFound("Project");
    await withTenantGuard(token.id as string, project.orgId);

    const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
    const completedFilter = req.nextUrl.searchParams.get("completed");
    const where: any = { projectId: params.id };
    if (completedFilter === "0") where.isCompleted = false;
    if (completedFilter === "1") where.isCompleted = true;

    const [total, tasks] = await Promise.all([
      prisma.projectTask.count({ where }),
      prisma.projectTask.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: [{ isCompleted: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json(paginatedResponse(tasks, total, page, limit));
  } catch (err) {
    return handleApiError(err);
  }
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

    // Verify assignee belongs to same org
    if (parsed.data.assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: parsed.data.assignedToId },
        select: { orgId: true },
      });
      if (!assignee || assignee.orgId !== project.orgId) {
        return apiError("VALIDATION_ERROR", "Assignee not found in this organisation.", 400);
      }
    }

    const task = await prisma.projectTask.create({
      data: {
        projectId: params.id,
        title: parsed.data.title,
        description: parsed.data.description,
        assignedToId: parsed.data.assignedToId ?? null,
        createdById: token.id as string,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    // Notify assignee
    if (task.assignedToId && task.assignedToId !== token.id) {
      await prisma.notification.create({
        data: {
          userId: task.assignedToId,
          type: "task_assigned",
          message: `You have been assigned a task: "${task.title}"`,
          link: `/dashboard/projects/${params.id}?tab=overview`,
        },
      });
    }

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "task.created",
      resourceId: task.id,
      meta: { title: task.title, assignedToId: task.assignedToId } as any,
      ipAddress: ip,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
