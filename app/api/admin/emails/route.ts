export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { handleApiError, unauthorized, forbidden } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

// GET /api/admin/emails — summary stats + paginated email activity log
// Supports: ?limit, ?offset, ?emailType
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await requireSuperAdmin(req);

    const params   = req.nextUrl.searchParams;
    const limit    = Math.min(parseInt(params.get("limit") ?? "500", 10), 2000);
    const offset   = parseInt(params.get("offset") ?? "0", 10);
    const emailType = params.get("emailType") ?? undefined;

    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // M3: Always fetch global stats regardless of emailType filter.
    // The filter only applies to the log rows and the filtered log count.
    const logWhere    = emailType ? { emailType } : undefined;

    // M1: All queries in a single Promise.all — no sequential round-trips.
    const [
      logs,
      filteredCount,          // count for pagination (may be filtered by emailType)
      globalMonthCount,       // M3: always global
      globalTotalCount,       // M3: always global
      activeTrials,
      expiredTrials,
      unsubscribedCount,
      churnReasons,
      trialCohortTotal,
      trialCohortUpgraded,
      bouncedCount,             // A4: hard-bounced users — never retry
    ] = await Promise.all([
      prisma.emailLog.findMany({
        where: logWhere,
        orderBy: { sentAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          orgId: true,
          recipientEmail: true,
          recipientName: true,
          emailType: true,
          subject: true,
          status: true,
          sentAt: true,
        },
      }),
      prisma.emailLog.count({ where: logWhere }),
      prisma.emailLog.count({ where: { sentAt: { gte: monthStart } } }),
      prisma.emailLog.count({}),
      prisma.org.count({ where: { planTier: "TRIAL", trialEndsAt: { gt: now } } }),
      prisma.org.count({ where: { planTier: "TRIAL", trialEndsAt: { lte: now } } }),
      prisma.user.count({ where: { emailUnsubscribedAt: { not: null } } }),
      prisma.org.groupBy({
        by: ["churnReason"],
        where: { churnReason: { not: null } },
        _count: { churnReason: true },
        orderBy: { _count: { churnReason: "desc" } },
        take: 1,
      }),
      // A2: denominator = only expired trials (trialEndsAt <= now), not all orgs that ever had a trial.
      // Using all orgs with a trialEndsAt inflated the rate by counting active trials as non-converted.
      prisma.org.count({ where: { trialEndsAt: { lte: now } } }),
      prisma.org.count({ where: { trialEndsAt: { lte: now }, plan: { not: "FREE" } } }),
      // A4: users with a hard bounce or spam complaint — useful for deliverability health monitoring.
      prisma.user.count({ where: { emailBouncedAt: { not: null } } }),
    ]);

    const topChurnReason = churnReasons[0]?.churnReason ?? null;
    const conversionRate = trialCohortTotal > 0
      ? Math.round((trialCohortUpgraded / trialCohortTotal) * 100)
      : 0;

    // Resolve org names for log rows
    const orgIds = Array.from(new Set(logs.map((l) => l.orgId).filter(Boolean))) as string[];
    const orgs   = orgIds.length
      ? await prisma.org.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
      : [];
    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

    const enriched = logs.map((l) => ({
      ...l,
      orgName: l.orgId ? (orgMap.get(l.orgId) ?? l.orgId) : null,
    }));

    return NextResponse.json({
      stats: {
        // M3: monthCount and totalCount are always global — not affected by emailType filter.
        monthCount:       globalMonthCount,
        totalCount:       globalTotalCount,
        topChurnReason,
        conversionRate,
        activeTrials,
        expiredTrials,
        unsubscribedCount,
        bouncedCount,
      },
      // filteredCount drives pagination (is scoped by emailType when active)
      filteredCount,
      logs: enriched,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
