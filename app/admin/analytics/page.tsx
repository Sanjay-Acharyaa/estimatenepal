import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { AnalyticsDashboardClient } from "./AnalyticsClient";

export const revalidate = 0;

function pct(num: number, den: number) {
  if (den === 0) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

function daysAgo(date: Date | null) {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function fmtDate(date: Date | null | undefined) {
  if (!date) return "—";
  return date.toLocaleDateString("en-NP", { day: "2-digit", month: "short", year: "numeric" });
}

function n(val: bigint | number | null | undefined): number {
  if (val == null) return 0;
  return typeof val === "bigint" ? Number(val) : val;
}

type FeatureRow = { event: string; _count: { event: number } };

async function loadData() {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    orgs,
    totalUsers,
    verifiedUsers,
    newUsersThisWeek,
    totalProjects,
    newProjectsThisWeek,
    coupons,
    featureEvents,
    weeklySignups,
    cohortData,
    ttvResult,
    drawingCount,
    takeoffItemCount,
  ] = await Promise.all([
    prisma.org.findMany({
      include: {
        _count: { select: { users: true, projects: true } },
        users: {
          select: { id: true, name: true, email: true, phone: true, lastLoginAt: true, emailVerified: true, createdAt: true, role: true },
          where: { isSuperAdmin: false },
        },
      },
      orderBy: { trialEndsAt: "asc" },
    }),

    prisma.user.count({ where: { isSuperAdmin: false } }),
    prisma.user.count({ where: { isSuperAdmin: false, emailVerified: true } }),
    prisma.user.count({ where: { isSuperAdmin: false, createdAt: { gte: d7 } } }),

    prisma.project.count(),
    prisma.project.count({ where: { createdAt: { gte: d7 } } }),

    prisma.coupon.findMany({ select: { redeemedAt: true, durationDays: true, createdAt: true, code: true } }),

    prisma.analyticsEvent.groupBy({
      by: ["event"],
      _count: { event: true },
      orderBy: { _count: { event: "desc" } },
    }).then(rows => rows as FeatureRow[]),

    prisma.$queryRaw<Array<{ week: string; cnt: bigint }>>`
      SELECT DATE_FORMAT(createdAt, '%Y-%u') as week, COUNT(*) as cnt
      FROM User WHERE isSuperAdmin = 0 AND createdAt >= ${d90}
      GROUP BY week ORDER BY week DESC LIMIT 12
    `,

    prisma.$queryRaw<Array<{ week: string; registered: bigint; active_7d: bigint; active_30d: bigint }>>`
      SELECT
        DATE_FORMAT(createdAt, '%Y-%u') as week,
        COUNT(*) as registered,
        SUM(CASE WHEN lastLoginAt IS NOT NULL AND lastLoginAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as active_7d,
        SUM(CASE WHEN lastLoginAt IS NOT NULL AND lastLoginAt >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as active_30d
      FROM User WHERE isSuperAdmin = 0
      GROUP BY week ORDER BY week DESC LIMIT 12
    `,

    prisma.$queryRaw<Array<{ avg_ttv_hours: number | null }>>`
      SELECT AVG(TIMESTAMPDIFF(HOUR, u.createdAt, sub.firstProject)) as avg_ttv_hours
      FROM (
        SELECT orgId, MIN(createdAt) as firstProject FROM Project GROUP BY orgId
      ) sub
      JOIN User u ON u.orgId = sub.orgId AND u.role = 'OWNER'
    `,

    prisma.drawing.count(),
    prisma.takeoffItem.count(),
  ]);

  return {
    orgs, totalUsers, verifiedUsers, newUsersThisWeek,
    totalProjects, newProjectsThisWeek, coupons,
    featureEvents, weeklySignups, cohortData,
    ttvResult, drawingCount, takeoffItemCount,
    now, d7, in7,
  };
}

export default async function AnalyticsDashboard() {
  const data = await loadData();
  const {
    orgs, totalUsers, verifiedUsers, newUsersThisWeek,
    totalProjects, newProjectsThisWeek, coupons,
    featureEvents, weeklySignups, cohortData,
    ttvResult, drawingCount, takeoffItemCount,
    now, in7,
  } = data;

  // ── Derived org stats ──────────────────────────────────────────────────────
  const totalOrgs = orgs.length;
  const activeTrials = orgs.filter(o => o.trialEndsAt && o.trialEndsAt > now).length;
  const expiringSoon = orgs.filter(o => o.trialEndsAt && o.trialEndsAt > now && o.trialEndsAt <= in7).length;
  const expiredOrgs = orgs.filter(o => o.trialEndsAt && o.trialEndsAt <= now).length;
  const orgsWithProjects = orgs.filter(o => o._count.projects > 0).length;
  const couponsUsed = coupons.filter(c => c.redeemedAt).length;
  const avgTTV = ttvResult[0]?.avg_ttv_hours;

  // Feature event counts
  const eventCount = (name: string) =>
    (featureEvents as FeatureRow[]).find(e => e.event === name)?._count.event ?? 0;

  // ── Per-org analytics ─────────────────────────────────────────────────────
  const orgAnalytics = orgs.map(org => {
    const daysLeft = org.trialEndsAt
      ? Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86400000)
      : null;
    const lastLogin = org.users.reduce((latest: Date | null, u) => {
      if (!u.lastLoginAt) return latest;
      return !latest || u.lastLoginAt > latest ? u.lastLoginAt : latest;
    }, null as Date | null);
    const daysSinceLogin = daysAgo(lastLogin);

    // Engagement score: projects(30) + login recency(40) + members>1(15) + has drawings(15)
    const projectScore = Math.min(org._count.projects * 15, 30);
    const loginScore =
      daysSinceLogin === null ? 0
      : daysSinceLogin === 0 ? 40
      : daysSinceLogin <= 2 ? 35
      : daysSinceLogin <= 5 ? 20
      : daysSinceLogin <= 10 ? 10
      : 3;
    const teamScore = org._count.users > 1 ? 15 : 0;
    const drawingScore = drawingCount > 0 && org._count.projects > 0 ? 15 : 0;
    const activityScore = Math.min(projectScore + loginScore + teamScore + drawingScore, 100);

    let status: "active" | "at_risk" | "expired" | "new";
    if (daysLeft !== null && daysLeft < 0) status = "expired";
    else if (daysLeft !== null && daysLeft <= 7 && (daysSinceLogin === null || daysSinceLogin > 3)) status = "at_risk";
    else if (daysSinceLogin === null && org._count.projects === 0) status = "new";
    else status = "active";

    return { org, daysLeft, lastLogin, daysSinceLogin, activityScore, status };
  });

  const atRisk = orgAnalytics.filter(o => o.status === "at_risk");
  const orgsWithProjectsCount = orgs.filter(o => o._count.projects > 0).length;

  // Serialize for client component (Dates → strings)
  const serializedOrgAnalytics = orgAnalytics.map(item => ({
    ...item,
    org: {
      ...item.org,
      trialEndsAt: item.org.trialEndsAt?.toISOString() ?? null,
      adminNotes: (item.org as any).adminNotes ?? null,
      churnReason: (item.org as any).churnReason ?? null,
      users: item.org.users.map(u => ({
        ...u,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    },
    lastLogin: item.lastLogin?.toISOString() ?? null,
  }));

  const overviewCards = [
    { label: "Total Orgs", value: totalOrgs, color: "bg-blue-50 border-blue-200 text-blue-700", filterKey: "all" as const },
    { label: "Active Trials", value: activeTrials, color: "bg-green-50 border-green-200 text-green-700", filterKey: "active" as const },
    { label: "Expiring in 7d", value: expiringSoon, color: expiringSoon > 0 ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-gray-50 border-gray-200 text-gray-500", filterKey: "expiring7d" as const },
    { label: "Expired", value: expiredOrgs, color: expiredOrgs > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-500", filterKey: "expired" as const },
    { label: "Total Users", value: totalUsers, color: "bg-purple-50 border-purple-200 text-purple-700", filterKey: "all" as const },
    { label: "New This Week", value: newUsersThisWeek, color: "bg-teal-50 border-teal-200 text-teal-700", filterKey: "new" as const },
    { label: "Total Projects", value: totalProjects, color: "bg-orange-50 border-orange-200 text-orange-700", filterKey: "all" as const },
    { label: "New Projects 7d", value: newProjectsThisWeek, color: "bg-pink-50 border-pink-200 text-pink-700", filterKey: "all" as const },
  ];

  // ── Activation funnel ─────────────────────────────────────────────────────
  const pdfExportOrgs = eventCount("pdf_export") > 0
    ? (await prisma.analyticsEvent.groupBy({ by: ["orgId"], where: { event: "pdf_export", orgId: { not: null } } })).length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-indigo-700 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-indigo-300 hover:text-white text-sm">← Admin</Link>
        <span className="font-bold text-lg">Analytics Dashboard</span>
        <span className="text-indigo-300 text-sm ml-auto">
          Updated: {now.toLocaleTimeString("en-NP")}
        </span>
      </div>

      <div className="p-6 space-y-8 max-w-screen-xl mx-auto">

        {/* ── TIER 1: Overview Cards + Action Required + Trial Health (client) ── */}
        <AnalyticsDashboardClient
          overviewCards={overviewCards}
          orgAnalytics={serializedOrgAnalytics}
          atRisk={serializedOrgAnalytics.filter(o => o.status === "at_risk")}
        />

        {/* ── TIER 1: Activation Funnel ─────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">Activation Funnel</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-end gap-0 overflow-x-auto">
              {[
                { step: "Registered", val: totalOrgs, color: "bg-blue-500", pct: 100 },
                { step: "Email Verified", val: orgs.filter(o => o.users.some((u: { emailVerified: boolean }) => u.emailVerified)).length, color: "bg-indigo-500", pct: Math.round((orgs.filter(o => o.users.some((u: { emailVerified: boolean }) => u.emailVerified)).length / Math.max(totalOrgs, 1)) * 100) },
                { step: "Created Project", val: orgsWithProjectsCount, color: "bg-purple-500", pct: Math.round((orgsWithProjectsCount / Math.max(totalOrgs, 1)) * 100) },
                { step: "Used Drawings", val: drawingCount > 0 ? orgsWithProjectsCount : 0, color: "bg-pink-500", pct: drawingCount > 0 ? Math.round((orgsWithProjectsCount / Math.max(totalOrgs, 1)) * 100) : 0 },
                { step: "Exported PDF", val: pdfExportOrgs, color: "bg-rose-500", pct: Math.round((pdfExportOrgs / Math.max(totalOrgs, 1)) * 100) },
              ].map((s, i) => (
                <div key={s.step} className="flex-1 min-w-[100px] flex flex-col items-center gap-1">
                  {i > 0 && <div className="text-xs text-gray-400 self-start pl-2">{s.pct}%</div>}
                  <div className="w-full px-2">
                    <div
                      className={`${s.color} rounded-t-lg transition-all`}
                      style={{ height: `${Math.max(s.pct, 4)}px`, minHeight: "4px" }}
                    />
                  </div>
                  <div className="text-2xl font-bold text-gray-800">{s.val}</div>
                  <div className="text-xs text-gray-500 text-center">{s.step}</div>
                  {i > 0 && <div className="text-xs text-gray-400">{pct(s.val, totalOrgs)} of total</div>}
                </div>
              ))}
            </div>

            {/* TTV */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-6 text-sm">
              <div>
                <span className="text-gray-500">Avg. Time to Value:</span>{" "}
                <span className="font-bold text-gray-800">
                  {avgTTV != null
                    ? avgTTV < 1 ? "< 1 hour"
                    : avgTTV < 24 ? `${Math.round(avgTTV)} hours`
                    : `${Math.round(avgTTV / 24)} days`
                    : "Not enough data"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Email verified:</span>{" "}
                <span className="font-bold text-gray-800">{pct(verifiedUsers, totalUsers)}</span>
              </div>
              <div>
                <span className="text-gray-500">Takeoff items created:</span>{" "}
                <span className="font-bold text-gray-800">{takeoffItemCount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </section>


        {/* ── TIER 3: Weekly Signups + Coupon Analytics ─────────────────── */}
        <div className="grid lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">Weekly Signups (Last 90 Days)</h2>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              {weeklySignups.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">No signup data yet.</p>
              ) : (
                <div className="space-y-2">
                  {[...weeklySignups].reverse().map(row => {
                    const count = n(row.cnt);
                    const maxCount = Math.max(...weeklySignups.map(r => n(r.cnt)));
                    return (
                      <div key={row.week} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-14 flex-shrink-0">Wk {row.week.split("-")[1]}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full flex items-center pl-2"
                            style={{ width: `${Math.max((count / maxCount) * 100, 3)}%` }}
                          >
                            <span className="text-white text-xs font-bold">{count}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">Coupon Analytics</h2>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Created", value: coupons.length, color: "text-gray-800" },
                  { label: "Redeemed", value: couponsUsed, color: "text-green-700" },
                  { label: "Unused", value: coupons.length - couponsUsed, color: "text-amber-600" },
                ].map(s => (
                  <div key={s.label} className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-500">{s.label}</div>
                  </div>
                ))}
              </div>
              {coupons.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-1.5 text-gray-500 font-medium">Code</th>
                        <th className="text-left py-1.5 text-gray-500 font-medium">Days</th>
                        <th className="text-left py-1.5 text-gray-500 font-medium">Status</th>
                        <th className="text-left py-1.5 text-gray-500 font-medium">Redeemed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {coupons.map(c => (
                        <tr key={c.code}>
                          <td className="py-1.5 font-mono text-gray-700">{c.code}</td>
                          <td className="py-1.5 text-gray-600">{c.durationDays}d</td>
                          <td className="py-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${c.redeemedAt ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                              {c.redeemedAt ? "Used" : "Unused"}
                            </span>
                          </td>
                          <td className="py-1.5 text-gray-400">{c.redeemedAt ? fmtDate(c.redeemedAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── TIER 4: Feature Adoption + Export Analytics ───────────────── */}
        <div className="grid lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">Feature Adoption</h2>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">Feature</th>
                    <th className="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">Total Uses</th>
                    <th className="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">Usage Bar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { label: "Projects Created", event: "project_created" },
                    { label: "PDF Exports", event: "pdf_export" },
                    { label: "Excel Exports", event: "excel_export" },
                    { label: "Tender Exports", event: "tender_export" },
                    { label: "Procurement Exports", event: "procurement_export" },
                    { label: "Assembly Applied", event: "assembly_applied" },
                    { label: "Drawings Uploaded", event: "drawing_uploaded" },
                    { label: "Invites Sent", event: "invite_sent" },
                    { label: "Coupons Redeemed", event: "coupon_redeemed" },
                    { label: "User Logins", event: "user_login" },
                  ].map(f => {
                    const count = eventCount(f.event);
                    const maxCount = Math.max(...[
                      "project_created","pdf_export","excel_export","tender_export",
                      "procurement_export","assembly_applied","drawing_uploaded",
                      "invite_sent","coupon_redeemed","user_login",
                    ].map(eventCount), 1);
                    return (
                      <tr key={f.event} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{f.label}</td>
                        <td className="px-4 py-2 font-bold text-gray-800">{count}</td>
                        <td className="px-4 py-2">
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${count === 0 ? 0 : Math.max((count / maxCount) * 100, 3)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {featureEvents.length === 0 && (
                <p className="text-center text-gray-400 text-xs py-4">Events start tracking from now. Data accumulates over time.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">Platform Stats (Tier 4)</h2>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
              {[
                { label: "Total Drawings Uploaded", value: drawingCount },
                { label: "Total Takeoff Items", value: takeoffItemCount },
                { label: "Total Projects", value: totalProjects },
                { label: "PDF Exports (tracked)", value: eventCount("pdf_export") },
                { label: "Excel Exports (tracked)", value: eventCount("excel_export") },
                { label: "Assemblies Applied", value: eventCount("assembly_applied") },
                { label: "Invites Sent", value: eventCount("invite_sent") },
                { label: "User Logins (tracked)", value: eventCount("user_login") },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-600">{s.label}</span>
                  <span className="font-bold text-gray-800 text-lg">{s.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── TIER 5: Weekly Cohort Retention ───────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-1">
            Cohort Retention (Tier 5)
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            Users grouped by registration week. Active = logged in within the stated window.
            Populates as users log in — sparse initially.
          </p>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">Cohort (Week)</th>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">Registered</th>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">Active 7d</th>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">Retention 7d</th>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">Active 30d</th>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">Retention 30d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cohortData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                      Data will appear here as users log in.
                    </td>
                  </tr>
                ) : (
                  cohortData.map(row => {
                    const reg = n(row.registered);
                    const a7 = n(row.active_7d);
                    const a30 = n(row.active_30d);
                    const r7 = reg > 0 ? Math.round((a7 / reg) * 100) : 0;
                    const r30 = reg > 0 ? Math.round((a30 / reg) * 100) : 0;
                    return (
                      <tr key={row.week} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700 font-mono">Wk {row.week.split("-")[1]} / {row.week.split("-")[0]}</td>
                        <td className="px-4 py-2 font-bold text-gray-800">{reg}</td>
                        <td className="px-4 py-2 text-gray-700">{a7}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            r7 >= 70 ? "bg-green-100 text-green-700"
                            : r7 >= 40 ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-600"
                          }`}>
                            {r7}%
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{a30}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            r30 >= 60 ? "bg-green-100 text-green-700"
                            : r30 >= 30 ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-600"
                          }`}>
                            {r30}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
