import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProjectStatusBadge } from "@/components/ui/ProjectStatusBadge";

import { fmtNPRCompact as fmt } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-400", ESTIMATING: "bg-yellow-400", SUBMITTED: "bg-blue-400",
  ACCEPTED: "bg-green-500", IN_PROGRESS: "bg-teal-500", COMPLETE: "bg-indigo-500",
  LOST: "bg-red-400", ARCHIVED: "bg-gray-300",
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/");
  const orgId = session.user.orgId;

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
    org,
    allProjects,
    recentProjects,
    pendingOverrides,
    dueSoon,
    recentActivity,
    drawingCount,
    takeoffCount,
    exportCount,
    lastWorkedProject,
  ] = await Promise.all([
    prisma.org.findUnique({ where: { id: orgId }, select: { plan: true, planTier: true } }),
    prisma.project.findMany({
      where: { orgId, status: { not: "ARCHIVED" } },
      select: { status: true, estimatedValue: true, bidDueDate: true },
    }),
    prisma.project.findMany({
      where: { orgId, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true, name: true, status: true, district: true, estimatedValue: true,
        _count: { select: { drawings: true } },
        disciplines: {
          select: {
            groups: {
              select: { _count: { select: { items: true } } },
            },
          },
        },
      },
    }),
    prisma.bOQOverride.count({ where: { project: { orgId }, status: "PENDING" } }),
    prisma.project.findMany({
      where: { orgId, bidDueDate: { gte: now, lte: sevenDays }, status: { notIn: ["ARCHIVED", "COMPLETE", "LOST"] } },
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
    prisma.drawing.count({ where: { project: { orgId } } }),
    prisma.takeoffItem.count({ where: { group: { discipline: { project: { orgId } } } } }),
    prisma.auditLog.count({ where: { orgId, event: { in: ["boq.export.pdf", "boq.export.excel", "boq.export.tender"] } } }),
    prisma.project.findFirst({
      where: { orgId, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, updatedAt: true, status: true, district: true, _count: { select: { drawings: true } } },
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

  // Onboarding checklist — show until all four steps complete
  const onboarding = {
    hasProject: total > 0,
    hasDrawing: drawingCount > 0,
    hasMeasurement: takeoffCount > 0,
    hasExport: exportCount > 0,
  };
  const onboardingDone = Object.values(onboarding).every(Boolean);
  const onboardingSteps = [
    { label: "Create your first project", done: onboarding.hasProject, href: "/dashboard/projects/new" },
    { label: "Upload a drawing", done: onboarding.hasDrawing, href: total > 0 ? `/dashboard/projects` : "/dashboard/projects/new" },
    { label: "Measure quantities on the drawing", done: onboarding.hasMeasurement, href: "/dashboard/projects" },
    { label: "Export your first BOQ", done: onboarding.hasExport, href: "/dashboard/projects" },
  ];
  const onboardingPercent = Math.round((Object.values(onboarding).filter(Boolean).length / 4) * 100);

  // Trial info
  const trialEndsAt = session.user.trialEndsAt ? new Date(session.user.trialEndsAt as string) : null;
  const trialDaysLeft = trialEndsAt ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000) : null;
  const isPaid = org?.plan && org.plan !== "FREE";

  function daysUntil(date: Date | string | null) {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - now.getTime()) / 86400000);
  }

  // Per-project takeoff item counts for export readiness
  const recentProjectsWithReadiness = recentProjects.map(p => {
    const itemCount = p.disciplines.reduce(
      (sum, d) => sum + d.groups.reduce((s, g) => s + g._count.items, 0),
      0
    );
    return { ...p, takeoffItemCount: itemCount };
  });

  function timeAgo(date: Date | string) {
    const diff = now.getTime() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {session?.user.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {session?.user.role} · {now.toLocaleDateString("en-NP", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Link
          href="/dashboard/projects/new"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          + New Project
        </Link>
      </div>

      {/* ── ONBOARDING CHECKLIST (new users only, until all steps done) ── */}
      {!onboardingDone && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="font-bold text-blue-900 text-base">Get started with Estimate Nepal</h2>
              <p className="text-blue-700 text-sm mt-0.5">Complete these steps to create your first BOQ export</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-2xl font-bold text-blue-600">{onboardingPercent}%</span>
              <p className="text-xs text-blue-500">complete</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-blue-100 rounded-full h-2 mb-5">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${onboardingPercent}%` }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {onboardingSteps.map((step, i) => (
              <Link
                key={i}
                href={step.done ? "#" : step.href}
                className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                  step.done
                    ? "bg-green-50 border-green-200 cursor-default"
                    : "bg-white border-blue-200 hover:border-blue-400 hover:shadow-sm"
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                  step.done ? "bg-green-500 text-white" : "bg-blue-100 text-blue-600"
                }`}>
                  {step.done ? "✓" : i + 1}
                </div>
                <span className={`text-sm font-medium ${step.done ? "text-green-700 line-through" : "text-gray-800"}`}>
                  {step.label}
                </span>
                {!step.done && <span className="ml-auto text-blue-400 text-xs">→</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── TRIAL COUNTDOWN (shown until paid) ── */}
      {!isPaid && trialDaysLeft !== null && trialDaysLeft >= 0 && (
        <div className={`rounded-2xl border p-5 flex items-center justify-between gap-4 flex-wrap ${
          trialDaysLeft <= 3 ? "bg-red-50 border-red-200" : trialDaysLeft <= 7 ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`text-3xl font-extrabold ${trialDaysLeft <= 3 ? "text-red-600" : trialDaysLeft <= 7 ? "text-amber-600" : "text-blue-600"}`}>
              {trialDaysLeft}d
            </div>
            <div>
              <p className={`font-semibold text-sm ${trialDaysLeft <= 3 ? "text-red-800" : trialDaysLeft <= 7 ? "text-amber-800" : "text-blue-800"}`}>
                {trialDaysLeft === 0 ? "Trial expires today" : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left on free trial`}
              </p>
              <p className={`text-xs mt-0.5 ${trialDaysLeft <= 3 ? "text-red-600" : trialDaysLeft <= 7 ? "text-amber-600" : "text-blue-600"}`}>
                Upgrade to keep all your projects and unlock unlimited exports
              </p>
            </div>
          </div>
          <Link
            href="/pricing"
            className={`flex-shrink-0 text-sm font-semibold px-5 py-2.5 rounded-xl transition text-white ${
              trialDaysLeft <= 3 ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            View Plans →
          </Link>
        </div>
      )}

      {/* ── RESUME CARD (last worked project) ── */}
      {lastWorkedProject && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-600 text-lg">📐</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">Continue where you left off</p>
              <p className="font-semibold text-gray-900 truncate">{lastWorkedProject.name}</p>
              <p className="text-xs text-gray-500">
                {lastWorkedProject.district && `${lastWorkedProject.district} · `}
                {lastWorkedProject._count.drawings} drawing{lastWorkedProject._count.drawings !== 1 ? "s" : ""} · updated {timeAgo(lastWorkedProject.updatedAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ProjectStatusBadge status={lastWorkedProject.status} />
            <Link
              href={`/dashboard/projects/${lastWorkedProject.id}`}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Open →
            </Link>
          </div>
        </div>
      )}

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard/projects" className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 transition group">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Active Projects</p>
          <p className="text-3xl font-bold text-blue-600">{activeCount}</p>
          <p className="text-xs text-gray-600 mt-1">{total} total</p>
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Pipeline Value</p>
          <p className="text-2xl font-bold text-gray-800">{pipelineValue > 0 ? fmt(pipelineValue) : "—"}</p>
          <p className="text-xs text-gray-600 mt-1">estimating + submitted</p>
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

      {/* ── SECONDARY ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Status breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Projects by Status</h2>
          {Object.keys(statusGroups).length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">No projects yet</p>
              <Link href="/dashboard/projects/new" className="text-sm text-blue-600 font-medium hover:underline">
                Create your first project →
              </Link>
            </div>
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
            <p className="text-sm text-gray-400">No upcoming deadlines.</p>
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

        {/* Quick stats + actions */}
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

          {/* Platform stats mini */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Your Stats</h2>
            <div className="space-y-2">
              {[
                { label: "Total Projects", value: total },
                { label: "Drawings Uploaded", value: drawingCount },
                { label: "Measurements Taken", value: takeoffCount },
                { label: "BOQ Exports", value: exportCount },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{s.label}</span>
                  <span className="text-xs font-bold text-gray-800">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

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
              <Link href="/help" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800">
                <span>❓</span> Help & Guide
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

      {/* ── RECENT PROJECTS with export readiness ── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Recent Projects</h2>
          <Link href="/dashboard/projects" className="text-sm text-blue-600 hover:underline">View all →</Link>
        </div>
        {recentProjectsWithReadiness.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-4xl mb-3">📁</p>
            <p className="text-gray-700 font-semibold mb-1">No projects yet</p>
            <p className="text-gray-500 text-sm mb-4">Create your first project to start estimating construction costs</p>
            <Link
              href="/dashboard/projects/new"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
            >
              Create First Project →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentProjectsWithReadiness.map(p => {
              const hasDrawings = p._count.drawings > 0;
              const hasMeasurements = p.takeoffItemCount > 0;
              const readyToExport = hasDrawings && hasMeasurements;
              return (
                <Link key={p.id} href={`/dashboard/projects/${p.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition group">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-600 transition">{p.name}</p>
                    {p.district && <p className="text-xs text-gray-500">{p.district}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    {p.estimatedValue != null && p.estimatedValue > 0 && (
                      <span className="text-xs text-gray-500 hidden sm:block">{fmt(p.estimatedValue)}</span>
                    )}
                    <span className="text-xs text-gray-400 hidden sm:block">{p._count.drawings} drawing{p._count.drawings !== 1 ? "s" : ""}</span>
                    {/* Export readiness indicator */}
                    <span className={`hidden sm:inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      readyToExport
                        ? "bg-green-100 text-green-700"
                        : hasDrawings
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {readyToExport ? "Ready to export" : hasDrawings ? "Needs measurements" : "No drawings"}
                    </span>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── RECENT ACTIVITY ── */}
      {recentActivity.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Recent Activity</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentActivity.map((log, i) => (
              <div key={i} className="px-6 py-2.5 flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-300 flex-shrink-0" />
                <p className="text-xs text-gray-600 flex-1">
                  <span className="font-medium text-gray-800">{log.user.name}</span>
                  {" "}{log.event.replace(/_/g, " ").replace(/\./g, " → ")}
                </p>
                <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(log.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
