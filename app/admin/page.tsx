import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { OrgPlanSetter } from "@/components/ui/OrgPlanSetter";

const LT = "loadtest.estimatenepal.local";
const PLAN_PRICE: Record<string, number> = { SOLO: 1499, TEAM3: 3499, TEAM5: 5499, ENTERPRISE: 9999 };

export default async function SuperAdminPage() {
  const now     = new Date();
  const d7      = new Date(now.getTime() - 7 * 86400000);
  const in7     = new Date(now.getTime() + 7 * 86400000);

  const [orgs, users, totalUserCount, newUsersThisWeek] = await Promise.all([
    prisma.org.findMany({
      include: { _count: { select: { users: true, projects: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { org: { select: { name: true } } },
    }),
    prisma.user.count({ where: { isSuperAdmin: false, NOT: { email: { contains: LT } } } }),
    prisma.user.count({ where: { isSuperAdmin: false, createdAt: { gte: d7 }, NOT: { email: { contains: LT } } } }),
  ]);

  // Derived KPIs (load-test orgs have only LT emails — kept in orgs list here for management purposes)
  const realOrgs     = orgs.filter(o => !(o as any).name?.toString().startsWith("loadtest"));
  const paidOrgs     = orgs.filter(o => !["TRIAL", "FREE"].includes((o as any).planTier ?? "TRIAL"));
  const activeTrials = orgs.filter(o => o.trialEndsAt && o.trialEndsAt > now && (o as any).planTier === "TRIAL").length;
  const expiringSoon = orgs.filter(o => o.trialEndsAt && o.trialEndsAt > now && o.trialEndsAt <= in7 && (o as any).planTier === "TRIAL").length;
  const estimatedMRR = paidOrgs.reduce((s, o) => s + (PLAN_PRICE[(o as any).planTier] ?? 0), 0);

  const kpis = [
    { label: "Total Orgs",     value: orgs.length,      color: "bg-blue-50 border-blue-200 text-blue-800",     href: "/admin/analytics" },
    { label: "Paid",           value: paidOrgs.length,  color: paidOrgs.length > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-gray-50 border-gray-200 text-gray-500", href: "/admin/analytics" },
    { label: "Est. MRR",       value: estimatedMRR > 0 ? `NPR ${estimatedMRR.toLocaleString("en-NP")}` : "NPR 0", color: "bg-emerald-50 border-emerald-200 text-emerald-700", href: "/admin/analytics" },
    { label: "Active Trials",  value: activeTrials,     color: "bg-green-50 border-green-200 text-green-800",   href: "/admin/analytics" },
    { label: "Expiring 7d",    value: expiringSoon,     color: expiringSoon > 0 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-gray-50 border-gray-200 text-gray-500", href: "/admin/analytics" },
    { label: "Total Users",    value: totalUserCount,   color: "bg-purple-50 border-purple-200 text-purple-800", href: "/admin/analytics" },
    { label: "New (7d)",       value: newUsersThisWeek, color: "bg-teal-50 border-teal-200 text-teal-800",      href: "/admin/analytics" },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <span className="font-bold text-lg">Super Admin</span>
        <span className="text-red-200 text-sm">Platform management</span>
        <div className="ml-auto">
          <Link href="/dashboard" className="text-sm text-red-200 hover:text-white">
            Back to Dashboard
          </Link>
        </div>
      </div>

      <div className="p-8 space-y-8">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {kpis.map(k => (
            <Link key={k.label} href={k.href}
              className={`rounded-xl border p-4 text-center hover:shadow-md transition ${k.color}`}>
              <div className="text-2xl font-extrabold">{k.value}</div>
              <div className="text-xs font-medium mt-1 opacity-70">{k.label}</div>
            </Link>
          ))}
        </div>

        {/* ── Quick links ── */}
        <div className="flex gap-3 flex-wrap">
          <Link href="/admin/rates"
            className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
            📋 DUDBC Rate Database
          </Link>
          <Link href="/admin/coupons"
            className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
            🎟️ Coupon Management
          </Link>
          <Link href="/admin/testimonials"
            className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
            ⭐ Testimonials
          </Link>
          <Link href="/admin/settings"
            className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
            ⚙️ Site Settings
          </Link>
          <Link href="/admin/analytics"
            className="inline-flex items-center gap-2 bg-indigo-600 border border-indigo-700 rounded-lg px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 shadow-sm">
            📊 Analytics Dashboard
          </Link>
          <Link href="/admin/activity"
            className="inline-flex items-center gap-2 bg-green-600 border border-green-700 rounded-lg px-4 py-2 text-sm font-medium text-white hover:bg-green-700 shadow-sm">
            🟢 Live Activity
          </Link>
        </div>

        {/* ── Paid customers highlight ── */}
        {paidOrgs.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-emerald-800 mb-3">
              Paid Customers ({paidOrgs.length})
            </h2>
            <div className="bg-white rounded-xl border border-emerald-200 overflow-x-auto">
              <table className="w-full text-sm" aria-label="Paid customers">
                <thead className="bg-emerald-50 border-b border-emerald-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-emerald-800 font-semibold">Name</th>
                    <th className="text-left px-4 py-3 text-emerald-800 font-semibold">Plan</th>
                    <th className="text-left px-4 py-3 text-emerald-800 font-semibold">Members</th>
                    <th className="text-left px-4 py-3 text-emerald-800 font-semibold">Projects</th>
                    <th className="text-left px-4 py-3 text-emerald-800 font-semibold">Since</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paidOrgs.map(org => (
                    <tr key={org.id} className="hover:bg-emerald-50">
                      <td className="px-4 py-3 font-bold text-gray-900">{org.name}</td>
                      <td className="px-4 py-3">
                        <OrgPlanSetter orgId={org.id} current={(org as any).planTier ?? "TRIAL"} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">{org._count.users}</td>
                      <td className="px-4 py-3 text-gray-600">{org._count.projects}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(org.createdAt).toLocaleDateString("en-NP", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── All Orgs ── */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            All Organisations ({orgs.length})
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm" aria-label="Organisations">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Members</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Projects</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Trial Ends</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orgs.map(org => (
                  <tr key={org.id} className={`hover:bg-gray-50 ${!["TRIAL","FREE"].includes((org as any).planTier ?? "TRIAL") ? "bg-emerald-50/30" : ""}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{org.name}</td>
                    <td className="px-4 py-3">
                      <OrgPlanSetter orgId={org.id} current={(org as any).planTier ?? "TRIAL"} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{org._count.users}</td>
                    <td className="px-4 py-3 text-gray-600">{org._count.projects}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {org.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString("en-NP", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {new Date(org.createdAt).toLocaleDateString("en-NP", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
                {orgs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No organisations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Recent Users ── */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Recent Users <span className="text-gray-500 font-normal text-sm">(latest 50 of {totalUserCount} total)</span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm" aria-label="Recent users">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Org</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Verified</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {user.name}
                      {user.isSuperAdmin && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">SUPER</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{user.email}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {(user as any).phone ? (
                        <a href={`tel:${(user as any).phone}`} className="text-blue-600 hover:underline text-xs">
                          {(user as any).phone}
                        </a>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{user.org?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{user.role}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.emailVerified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {user.emailVerified ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date((user as any).createdAt).toLocaleDateString("en-NP", { day: "2-digit", month: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
