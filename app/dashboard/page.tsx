import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ProjectStatusBadge } from "@/components/ui/ProjectStatusBadge";

export default async function DashboardPage() {
  const session = await getSession();
  const orgId = session!.user.orgId;

  // Super admin has no org — show platform-wide empty state
  if (!orgId) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome, {session?.user.name}</h1>
        <p className="text-gray-500 text-sm mb-8">Super Admin — Platform management</p>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Super admins do not belong to an organisation. Use the{" "}
          <a href="/admin" className="text-red-600 hover:underline font-medium">Admin Panel</a>{" "}
          to manage organisations and users.
        </div>
      </div>
    );
  }

  const [activeProjects, recentProjects, pendingOverrides] = await Promise.all([
    prisma.project.count({
      where: {
        orgId,
        status: { notIn: ["ARCHIVED", "COMPLETE", "LOST"] },
      },
    }),
    prisma.project.findMany({
      where: { orgId, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { _count: { select: { drawings: true } } },
    }),
    prisma.bOQOverride.count({
      where: { project: { orgId }, status: "PENDING" },
    }),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Welcome back, {session?.user.name}
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        {session?.user.role} · {new Date().toLocaleDateString("en-NP", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link href="/dashboard/projects?status=ESTIMATING" className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 transition">
          <div className="text-3xl font-bold text-blue-600">{activeProjects}</div>
          <div className="text-sm text-gray-500 mt-1">Active Projects</div>
        </Link>
        <Link href="/dashboard/bid-board" className="bg-white rounded-xl border border-gray-200 p-6 hover:border-green-300 transition">
          <div className="text-3xl font-bold text-green-600">{recentProjects.reduce((s, p) => s + p._count.drawings, 0)}</div>
          <div className="text-sm text-gray-500 mt-1">Total Drawings</div>
        </Link>
        <Link href="/dashboard/projects" className="bg-white rounded-xl border border-gray-200 p-6 hover:border-orange-300 transition">
          <div className="text-3xl font-bold text-orange-500">{pendingOverrides}</div>
          <div className="text-sm text-gray-500 mt-1">Pending Overrides</div>
        </Link>
      </div>

      {/* Recent projects */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Recent Projects</h2>
          <Link href="/dashboard/projects" className="text-sm text-blue-600 hover:underline">View all</Link>
        </div>
        {recentProjects.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            No projects yet.{" "}
            <Link href="/dashboard/projects/new" className="text-blue-600 hover:underline">Create your first project</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentProjects.map((p) => (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`}
                className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.name}</p>
                  {p.district && <p className="text-xs text-gray-400">{p.district}</p>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400">{p._count.drawings} drawings</span>
                  <ProjectStatusBadge status={p.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/dashboard/projects/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-lg text-center transition">
          + New Project
        </Link>
        <Link href="/dashboard/bid-board"
          className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium px-4 py-3 rounded-lg text-center transition">
          Bid Board
        </Link>
        <Link href="/dashboard/projects"
          className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium px-4 py-3 rounded-lg text-center transition">
          All Projects
        </Link>
        {session?.user.isSuperAdmin && (
          <Link href="/admin"
            className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-sm font-medium px-4 py-3 rounded-lg text-center transition">
            Admin Panel
          </Link>
        )}
      </div>
    </div>
  );
}
