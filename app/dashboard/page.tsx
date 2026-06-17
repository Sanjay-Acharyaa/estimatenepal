import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ProjectStatusBadge } from "@/components/ui/ProjectStatusBadge";

function fmt(n: number) {
  if (n >= 10_000_000) return `Rs ${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `Rs ${(n / 100_000).toFixed(1)}L`;
  return `Rs ${n.toLocaleString("en-NP")}`;
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-400", ESTIMATING: "bg-yellow-400", SUBMITTED: "bg-blue-400",
  ACCEPTED: "bg-green-500", IN_PROGRESS: "bg-teal-500", COMPLETE: "bg-indigo-500",
  LOST: "bg-red-400", ARCHIVED: "bg-gray-300",
};

export default async function DashboardPage() {
  const session = await getSession();
  const orgId = session!.user.orgId;

  if (!orgId) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome, {session?.user.name}</h1>
        <p className="text-gray-500 text-sm mb-8">Super Admin — Platform management</p>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600 text-sm">
          Super admins do not belong to an organisation. Use the{" "}
          <a href="/admin" className="text-red-600 hover:underline font-medium">Admin Panel</a>{" "}
          to manage organisations and users.
        </div>
      </div>
    );
  }

  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const [
    allProjects,
    recentProjects,
    pendingOverrides,
    dueSoon,
    recentActivity,
  ] = await Promise.all([
    prisma.project.findMany({
      where: { orgId, status: { not: "ARCHIVED" } },
      select: { status: true, estimatedValue: true, bidDueDate: true },
    }),
    prisma.project.findMany({
      where: { orgId, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { _count: { select: { drawings: true } } },
    }),
    prisma.bOQOverride.count({ where: { project: { orgId }, status: "PENDING" } }),
    prisma.project.findMany({
      where: { orgId, bidDueDate: { gte: now.toISOString(), lte: sevenDays.toISOString() }, status: { notIn: ["ARCHIVED", "COMPLETE", "LOST"] } },
      orderBy: { bidDueDate: "asc" },
      take: 5,
      select: { id: true, name: true, bidDueDate: true, status: true },
    }),
    prisma.auditLog.findMany({
      where: { orgId, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { event: true, createdAt: true, meta: true, user: { select: { name: true } } },
    }),
  ]);

  // Analytics calculations
  const total = allProjects.length;
  const won = allProjects.filter(p => ["ACCEPTED", "IN_PROGRESS", "COMPLETE"].includes(p.status)).length;
  const lost = allProjects.filter(p => p.status === "LOST").length;
  const decided = won + lost;
  const winRate = decided > 0 ? Math.round((won / decided) * 100) : null;

  const pipelineValue = allProjects
    .filter(p => ["ESTIMATING", "SUBMITTED", "DRAFT"].includes(p.status))
    .reduce((s, p) => s + (p.estimatedValue ?? 0), 0);

  const wonValue = allProjects
    .filter(p => ["ACCEPTED", "IN_PROGRESS", "COMPLETE"].includes(p.status))
    .reduce((s, p) => s + (p.estimatedValue ?? 0), 0);

  const statusGroups = allProjects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const activeCount = allProjects.filter(p => !["COMPLETE", "LOST", "ARCHIVED"].includes(p.status)).length;

  function daysUntil(date: Date | string | null) {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - now.getTime()) / 86400000);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {session?.user.name}</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {session?.user.role} · {now.toLocaleDateString("en-NP", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard/projects" className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 transition group">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Active Projects</p>
          <p className="text-3xl font-bold text-blue-600">{activeCount}</p>
          <p className="text-xs text-gray-600 mt-1">{total} total</p>
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Pipeline Value</p>
          <p className="text-2xl font-bold text-gray-800">{pipelineValue > 0 ? fmt(pipelineValue) : "—"}</p>
          <p className="text-xs text-gray-600 mt-1">in estimating / submitted</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Won Value</p>
          <p className="text-2xl font-bold text-green-600">{wonValue > 0 ? fmt(wonValue) : "—"}</p>
          <p className="text-xs text-gray-600 mt-1">accepted + in progress</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Win Rate</p>
          <p className="text-3xl font-bold text-indigo-600">{winRate !== null ? `${winRate}%` : "—"}</p>
          <p className="text-xs text-gray-600 mt-1">{won} won · {lost} lost</p>
        </div>
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Status breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Projects by Status</h2>
          {Object.keys(statusGroups).length === 0 ? (
            <p className="text-sm text-gray-600">No projects yet.</p>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(statusGroups)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <div key={status} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLOR[status] ?? "bg-gray-300"}`} />
                    <span className="text-xs text-gray-600 flex-1">{status.replace(/_/g, " ")}</span>
                    <span className="text-xs font-semibold text-gray-800">{count}</span>
                    <div className="w-20 bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${STATUS_COLOR[status] ?? "bg-gray-300"}`}
                        style={{ width: `${Math.round((count / total) * 100)}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Due soon */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Due in Next 7 Days</h2>
          {dueSoon.length === 0 ? (
            <p className="text-sm text-gray-600">No upcoming deadlines.</p>
          ) : (
            <div className="space-y-2">
              {dueSoon.map(p => {
                const d = daysUntil(p.bidDueDate);
                return (
                  <Link key={p.id} href={`/dashboard/projects/${p.id}`}
                    className="flex items-center justify-between hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2 transition">
                    <span className="text-sm text-gray-700 truncate flex-1">{p.name}</span>
                    <span className={`text-xs font-semibold ml-2 flex-shrink-0 ${d === 0 ? "text-red-600" : d !== null && d <= 2 ? "text-orange-500" : "text-yellow-600"}`}>
                      {d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d}d`}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Pending overrides + quick actions */}
        <div className="space-y-4">
          {pendingOverrides > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <span className="text-2xl font-bold text-amber-600">{pendingOverrides}</span>
              <div>
                <p className="text-sm font-medium text-amber-800">Pending BOQ Overrides</p>
                <p className="text-xs text-amber-600">Rate changes awaiting approval</p>
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Quick Actions</h2>
            <div className="space-y-2">
              <Link href="/dashboard/projects/new" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
                <span>＋</span> New Project
              </Link>
              <Link href="/dashboard/bid-board" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800">
                <span>📋</span> Bid Board
              </Link>
              <Link href="/dashboard/assemblies" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800">
                <span>🏗️</span> Assembly Library
              </Link>
              <Link href="/dashboard/rates" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800">
                <span>💰</span> Rate Catalog
              </Link>
              {session?.user.isSuperAdmin && (
                <Link href="/admin" className="flex items-center gap-2 text-sm text-red-600 hover:text-red-800">
                  <span>⚙️</span> Admin Panel
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent projects */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Recent Projects</h2>
          <Link href="/dashboard/projects" className="text-sm text-blue-600 hover:underline">View all →</Link>
        </div>
        {recentProjects.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-600 text-sm">
            No projects yet.{" "}
            <Link href="/dashboard/projects/new" className="text-blue-600 hover:underline">Create your first project</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentProjects.map(p => (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`}
                className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                  {p.district && <p className="text-xs text-gray-600">{p.district}</p>}
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  {(p as any).estimatedValue > 0 && (
                    <span className="text-xs text-gray-500">{fmt((p as any).estimatedValue)}</span>
                  )}
                  <span className="text-xs text-gray-600">{p._count.drawings} drawings</span>
                  <ProjectStatusBadge status={p.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Recent Activity</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentActivity.map((log, i) => (
              <div key={i} className="px-6 py-2.5 flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                <p className="text-xs text-gray-600 flex-1">
                  <span className="font-medium text-gray-700">{log.user.name}</span>
                  {" "}{log.event.replace(/\./g, " → ")}
                </p>
                <span className="text-xs text-gray-600 flex-shrink-0">
                  {new Date(log.createdAt).toLocaleDateString("en-NP")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
