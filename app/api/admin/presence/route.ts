import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOnlineUsers, getHeatmap } from "@/lib/presence";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = await checkApiRateLimit(ip);
  if (limited) return limited;

  const session = await getSession();
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [online, heatmap, topUsers] = await Promise.all([
    getOnlineUsers(),
    getHeatmap(),
    // Top users by total session time (last 30 days)
    prisma.userSession.groupBy({
      by: ["userId"],
      _sum: { durationSeconds: true },
      _count: { id: true },
      _max: { durationSeconds: true, startedAt: true },
      orderBy: { _sum: { durationSeconds: "desc" } },
      take: 20,
    }),
  ]);

  // Enrich top users with name/email
  const userIds = topUsers.map(u => u.userId);
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, orgId: true },
      })
    : [];
  const orgIds = Array.from(new Set(users.map(u => u.orgId).filter(Boolean) as string[]));
  const orgs = orgIds.length > 0
    ? await prisma.org.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
    : [];
  const orgMap = Object.fromEntries(orgs.map(o => [o.id, o.name]));
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const enrichedTopUsers = topUsers.map(row => {
    const u = userMap[row.userId];
    return {
      userId: row.userId,
      name: u?.name ?? "Unknown",
      email: u?.email ?? "",
      orgName: u?.orgId ? (orgMap[u.orgId] ?? null) : null,
      totalSeconds: row._sum.durationSeconds ?? 0,
      sessionCount: row._count.id,
      longestSessionSeconds: row._max.durationSeconds ?? 0,
      lastActive: row._max.startedAt?.toISOString() ?? null,
    };
  });

  // Per-user daily breakdown for top 10 (last 7 days)
  const top10Ids = topUsers.slice(0, 10).map(u => u.userId);
  const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dailySessions = top10Ids.length > 0
    ? await prisma.userSession.findMany({
        where: { userId: { in: top10Ids }, startedAt: { gte: d7 } },
        select: { userId: true, durationSeconds: true, date: true, pageCount: true },
        orderBy: { date: "desc" },
      })
    : [];

  // Group daily sessions by userId → date → total seconds
  const dailyByUser: Record<string, Record<string, number>> = {};
  for (const s of dailySessions) {
    const dateStr = s.date.toISOString().slice(0, 10);
    if (!dailyByUser[s.userId]) dailyByUser[s.userId] = {};
    dailyByUser[s.userId][dateStr] = (dailyByUser[s.userId][dateStr] ?? 0) + s.durationSeconds;
  }

  return NextResponse.json({
    online,
    heatmap,
    topUsers: enrichedTopUsers,
    dailyByUser,
  });
}
