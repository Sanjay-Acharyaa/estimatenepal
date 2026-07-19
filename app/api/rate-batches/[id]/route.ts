import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { withTenantGuard } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { checkApiRateLimit, getClientIp } from "@/lib/security";
import { handleApiError, apiError, unauthorized, forbidden, notFound } from "@/lib/errors";
import { invalidateRatesCache } from "@/lib/rates";
import { redis } from "@/lib/redis";

const BATCH_ID_RE = /^[a-zA-Z0-9_-]+$/;

const renameSchema = z.object({
  name: z.string().min(1).max(150).trim(),
});

// PUT /api/rate-batches/[id] — rename a rate book
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    if (!BATCH_ID_RE.test(params.id) || params.id.length > 128)
      return apiError("VALIDATION_ERROR", "Invalid batch ID.", 400);

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const batch = await prisma.rateBatch.findUnique({ where: { id: params.id } });
    if (!batch) throw notFound("Rate book");
    if (batch.orgId !== (token.orgId as string)) throw forbidden();

    const body = await req.json();
    const parsed = renameSchema.safeParse(body);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten());

    const updated = await prisma.rateBatch.update({
      where: { id: params.id },
      data: { name: parsed.data.name },
    });

    appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "rate_batch.renamed",
      resourceId: params.id,
      meta: { name: parsed.data.name } as any,
      ipAddress: ip,
    });

    invalidateRatesCache().catch(() => {});

    return NextResponse.json({ id: updated.id, name: updated.name });
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/rate-batches/[id] — delete a rate book and all its rates
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    if (!BATCH_ID_RE.test(params.id) || params.id.length > 128)
      return apiError("VALIDATION_ERROR", "Invalid batch ID.", 400);

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();
    if (!token.orgId) throw forbidden();

    const user = await withTenantGuard(token.id as string, token.orgId as string);
    if (!["OWNER", "ADMIN"].includes(user.role)) throw forbidden();

    const batch = await prisma.rateBatch.findUnique({
      where: { id: params.id },
      include: { _count: { select: { items: true } } },
    });
    if (!batch) throw notFound("Rate book");
    if (batch.orgId !== (token.orgId as string)) throw forbidden();

    // Collect rate item IDs before deletion so their analysis-line caches can be purged
    const batchItems = await prisma.rateItem.findMany({
      where: { batchId: params.id },
      select: { id: true },
    });

    // Delete all rate items in the batch first, then the batch itself
    await prisma.$transaction([
      prisma.rateItem.deleteMany({ where: { batchId: params.id } }),
      prisma.rateBatch.delete({ where: { id: params.id } }),
    ]);

    // Purge analysis-line caches for all deleted rate items
    for (const item of batchItems) {
      redis.del(`analysis-lines:${token.orgId}:${item.id}`).catch(() => {});
    }

    appendAuditLog({
      orgId: token.orgId as string,
      userId: token.id as string,
      event: "rate_batch.deleted",
      resourceId: params.id,
      meta: { name: batch.name, itemCount: batch._count.items } as any,
      ipAddress: ip,
    });

    invalidateRatesCache().catch(() => {});

    return NextResponse.json({ deleted: batch._count.items, message: `Rate book "${batch.name}" deleted.` });
  } catch (err) {
    return handleApiError(err);
  }
}
