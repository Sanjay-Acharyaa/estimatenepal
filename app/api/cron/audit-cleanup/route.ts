import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUDIT_CLEANUP_BATCH_SIZE, AUDIT_RETENTION_DAYS } from "@/lib/cache-constants";

// DELETE /api/cron/audit-cleanup
// Deletes AuditLog and AnalyticsEvent rows older than AUDIT_RETENTION_DAYS in batches
// to avoid long-running table locks.
//
// Protect with CRON_SECRET so it cannot be invoked by unauthenticated users.
// Set Authorization: Bearer <CRON_SECRET> on the scheduler request.

export const maxDuration = 60;

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let auditDeleted = 0;
  let analyticsDeleted = 0;
  let batchDeleted: number;

  // Clean AuditLog
  do {
    const rows = await prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: AUDIT_CLEANUP_BATCH_SIZE,
      orderBy: { createdAt: "asc" },
    });
    if (rows.length === 0) break;
    const result = await prisma.auditLog.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
    batchDeleted = result.count;
    auditDeleted += batchDeleted;
  } while (batchDeleted === AUDIT_CLEANUP_BATCH_SIZE);

  // Clean AnalyticsEvent with the same retention window
  do {
    const rows = await prisma.analyticsEvent.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: AUDIT_CLEANUP_BATCH_SIZE,
      orderBy: { createdAt: "asc" },
    });
    if (rows.length === 0) break;
    const result = await prisma.analyticsEvent.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
    batchDeleted = result.count;
    analyticsDeleted += batchDeleted;
  } while (batchDeleted === AUDIT_CLEANUP_BATCH_SIZE);

  return NextResponse.json({
    auditDeleted,
    analyticsDeleted,
    cutoff: cutoff.toISOString(),
    retentionDays: AUDIT_RETENTION_DAYS,
  });
}
