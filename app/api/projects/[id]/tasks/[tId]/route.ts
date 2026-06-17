import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { handleApiError, apiError, unauthorized, notFound, forbidden } from "@/lib/errors";
import { withTenantGuard } from "@/lib/auth";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { appendAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  title: z.string().min(1).max(300).trim().optional(),
  description: z.string().max(2000).nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  isCompleted: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; tId: string } }
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

    const task = await prisma.projectTask.findUnique({ where: { id: params.tId } });
    if (!task || task.projectId !== params.id) throw notFound("Task");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    // Validate new assignee if changing
    if (parsed.data.assignedToId && parsed.data.assignedToId !== task.assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: parsed.data.assignedToId },
        select: { orgId: true },
      });
      if (!assignee || assignee.orgId !== project.orgId) {
        return apiError("VALIDATION_ERROR", "Assignee not found in this organisation.", 400);
      }
    }

    const wasCompleted = task.isCompleted;
    const nowCompleted = parsed.data.isCompleted;

    const updated = await prisma.projectTask.update({
      where: { id: params.tId },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.assignedToId !== undefined && { assignedToId: parsed.data.assignedToId }),
        ...(parsed.data.dueDate !== undefined && { dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null }),
        ...(nowCompleted !== undefined && {
          isCompleted: nowCompleted,
          completedAt: nowCompleted && !wasCompleted ? new Date() : nowCompleted === false ? null : undefined,
        }),
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    // Notify new assignee if changed — fire-and-forget
    if (parsed.data.assignedToId && parsed.data.assignedToId !== task.assignedToId && parsed.data.assignedToId !== token.id) {
      prisma.notification.create({
        data: {
          userId: parsed.data.assignedToId,
          type: "task_assigned",
          message: `You have been assigned a task: "${updated.title}"`,
          link: `/dashboard/projects/${params.id}?tab=overview`,
        },
      }).catch((err) => console.error("[tasks/update] notification failed:", err));
    }

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "task.updated",
      resourceId: params.tId,
      meta: parsed.data as any,
      ipAddress: ip,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; tId: string } }
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

    const task = await prisma.projectTask.findUnique({ where: { id: params.tId } });
    if (!task || task.projectId !== params.id) throw notFound("Task");

    const isAdmin = ["OWNER", "ADMIN"].includes(token.role as string);
    if (task.createdById !== token.id && !isAdmin) throw forbidden();

    await prisma.projectTask.delete({ where: { id: params.tId } });

    await appendAuditLog({
      orgId: project.orgId,
      userId: token.id as string,
      event: "task.deleted",
      resourceId: params.tId,
      meta: { title: task.title } as any,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
