import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/cron/audit-cleanup
// Deletes AuditLog rows older than 90 days in batches of 5000 to avoid long-running
// table locks. This route is meant to be called by a scheduled job (Vercel Cron or similar).
//
// Protect with CRON_SECRET so it cannot be invoked by unauthenticated users.
// Set Authorization: Bearer <CRON_SECRET> on the scheduler request, or configure the
// cron key in vercel.json: { "crons": [{ "path": "/api/cron/audit-cleanup", "schedule": "0 2 * * *" }] }

const BATCH_SIZE = 5000;
const RETENTION_DAYS = 90;

export const maxDuration = 60;

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;
  let batchDeleted: number;

  do {
    // Fetch a batch of IDs to delete — avoids a single enormous DELETE statement
    const rows = await prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
      orderBy: { createdAt: "asc" },
    });

    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const result = await prisma.auditLog.deleteMany({ where: { id: { in: ids } } });
    batchDeleted = result.count;
    totalDeleted += batchDeleted;
  } while (batchDeleted === BATCH_SIZE);

  return NextResponse.json({
    deleted: totalDeleted,
    cutoff: cutoff.toISOString(),
    retentionDays: RETENTION_DAYS,
  });
}
