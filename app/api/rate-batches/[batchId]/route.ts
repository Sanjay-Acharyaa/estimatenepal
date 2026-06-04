import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit } from "@/lib/security";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";

const renameSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

export async function PUT(req: NextRequest, { params }: { params: { batchId: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const batch = await prisma.rateBatch.findUnique({ where: { id: params.batchId } });
    if (!batch || batch.orgId !== (token.orgId as string)) throw notFound("Rate batch");

    const body = await req.json();
    const parsed = renameSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.rateBatch.update({
      where: { id: params.batchId },
      data: { name: parsed.data.name },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { batchId: string } }) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const batch = await prisma.rateBatch.findUnique({
      where: { id: params.batchId },
      include: { _count: { select: { items: true } } },
    });
    if (!batch || batch.orgId !== (token.orgId as string)) throw notFound("Rate batch");

    // Deleting RateItems will trigger onDelete:SetNull on TakeoffGroup.rateItemId
    // Deleting the batch will trigger onDelete:SetNull on RateItem.batchId
    await prisma.rateItem.deleteMany({ where: { batchId: params.batchId } });
    await prisma.rateBatch.delete({ where: { id: params.batchId } });

    await appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "rate_batch.deleted",
      resourceId: params.batchId,
      meta: { name: batch.name, itemCount: batch.itemCount } as any,
      ipAddress: ip,
    });

    return NextResponse.json({
      message: `Rate book "${batch.name}" deleted. ${batch.itemCount} rates removed. Affected takeoff groups have been unlinked.`,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
