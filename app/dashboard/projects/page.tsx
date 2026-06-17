import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ProjectStatusBadge } from "@/components/ui/ProjectStatusBadge";

const PAGE_SIZE = 20;

const VALID_SORT = ["name", "createdAt", "bidDueDate", "status"] as const;

function SortLink({
  col,
  label,
  currentSort,
  currentDir,
  search,
  status,
}: {
  col: string;
  label: string;
  currentSort: string;
  currentDir: string;
  search: string;
  status: string;
}) {
  const isActive = currentSort === col;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";
  const arrow = isActive ? (currentDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <Link
      href={`/dashboard/projects?sort=${col}&dir=${nextDir}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`}
      className={`hover:text-blue-600 ${isActive ? "text-blue-600 font-semibold" : ""}`}
    >
      {label}{arrow}
    </Link>
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { page?: string; search?: string; status?: string; sort?: string; dir?: string };
}) {
  const session = await getSession();
  const orgId = session!.user.orgId;
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const search = searchParams.search ?? "";
  const status = searchParams.status ?? "";
  const sort = VALID_SORT.includes(searchParams.sort as any) ? searchParams.sort! : "createdAt";
  const dir = searchParams.dir === "asc" ? "asc" : "desc";
  const skip = (page - 1) * PAGE_SIZE;

  if (!orgId) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Projects</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600 text-sm">
          Super admins do not belong to an organisation. Use the{" "}
          <a href="/admin" className="text-red-600 hover:underline">Admin Panel</a> to manage organisations.
        </div>
      </div>
    );
  }

  // MEMBER restriction: if MEMBER has explicit assignments, only show those projects
  const user = await prisma.user.findUnique({ where: { id: session!.user.id } });
  const hasExplicitAssignments =
    user?.role === "MEMBER"
      ? (await prisma.projectMember.count({ where: { userId: session!.user.id } })) > 0
      : false;

  const where: any = {
    orgId,
    ...(search && { name: { contains: search } }),
    ...(status && { status }),
    ...(hasExplicitAssignments && { members: { some: { userId: session!.user.id } } }),
  };

  const isAdmin = ["OWNER", "ADMIN"].includes(session!.user.role);

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: { [sort]: dir },
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
          take: 3,
        },
        _count: { select: { drawings: true } },
      },
    }),
    prisma.project.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const statuses = [
    "ESTIMATING", "BID_SUBMITTED", "ACCEPTED",
    "IN_PROGRESS", "COMPLETE", "LOST", "ARCHIVED",
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 text-sm mt-1">{total} project{total !== 1 ? "s" : ""}</p>
        </div>
        {isAdmin && (
          <Link
            href="/dashboard/projects/new"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            + New Project
          </Link>
        )}
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-3 mb-6" role="search" aria-label="Filter projects">
        <label htmlFor="project-search" className="sr-only">Search projects</label>
        <input
          id="project-search"
          name="search"
          defaultValue={search}
          placeholder="Search projects..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label htmlFor="project-status" className="sr-only">Filter by status</label>
        <select
          id="project-status"
          name="status"
          defaultValue={status}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          Filter
        </button>
        {(search || status) && (
          <Link href="/dashboard/projects" className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Clear
          </Link>
        )}
      </form>

      {/* Table — overflow-x-auto prevents content clipping on narrower viewports */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm" aria-label="Projects list">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                <SortLink col="name" label="Project Name" currentSort={sort} currentDir={dir} search={search} status={status} />
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Client</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                <SortLink col="bidDueDate" label="Due Date" currentSort={sort} currentDir={dir} search={search} status={status} />
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Est. Value (NRS)</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                <SortLink col="status" label="Status" currentSort={sort} currentDir={dir} search={search} status={status} />
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Team</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Drawings</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/projects/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                    {p.name}
                  </Link>
                  {p.district && <p className="text-gray-600 text-xs mt-0.5">{p.district}</p>}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {p.clientCompany || p.clientName ? (
                    <div>
                      <p className="font-medium text-gray-700">{p.clientCompany ?? "—"}</p>
                      {p.clientName && <p className="text-gray-600">{p.clientName}</p>}
                    </div>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {p.bidDueDate ? (
                    <span className={new Date(p.bidDueDate) < new Date() ? "text-red-500 font-medium" : ""}>
                      {new Date(p.bidDueDate).toLocaleDateString()}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {p.estimatedValue != null
                    ? `Rs ${p.estimatedValue.toLocaleString("en-NP")}`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <ProjectStatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex -space-x-1">
                    {p.members.map((m) => (
                      <div
                        key={m.userId}
                        aria-label={m.user.name}
                        className="w-7 h-7 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center border-2 border-white font-medium select-none"
                      >
                        <span aria-hidden>{m.user.name.charAt(0).toUpperCase()}</span>
                      </div>
                    ))}
                    {p.members.length === 0 && <span className="text-gray-600 text-xs">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">{p._count.drawings}</td>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/projects/${p.id}`} className="text-blue-600 hover:underline text-xs font-medium">
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-600">
                  {search || status ? "No projects match your filters." : "No projects yet."}
                  {isAdmin && !search && !status && (
                    <>{" "}<Link href="/dashboard/projects/new" className="text-blue-600 hover:underline">Create one</Link></>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {page} of {totalPages} — {total} total</p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/dashboard/projects?page=${page - 1}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&sort=${sort}&dir=${dir}`}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Previous</Link>
            )}
            {page < totalPages && (
              <Link href={`/dashboard/projects?page=${page + 1}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&sort=${sort}&dir=${dir}`}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Next</Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
