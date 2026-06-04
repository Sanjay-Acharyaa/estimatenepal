import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BidBoardClient } from "@/components/bid-board/BidBoardClient";

const COLUMNS = [
  { status: "ESTIMATING",    label: "Estimating",    color: "bg-blue-500" },
  { status: "BID_SUBMITTED", label: "Bid Submitted", color: "bg-yellow-500" },
  { status: "ACCEPTED",      label: "Accepted",      color: "bg-green-500" },
  { status: "IN_PROGRESS",   label: "In Progress",   color: "bg-indigo-500" },
  { status: "COMPLETE",      label: "Complete",      color: "bg-gray-500" },
  { status: "LOST",          label: "Lost",          color: "bg-red-500" },
  { status: "ARCHIVED",      label: "Archived",      color: "bg-gray-400" },
];

function formatNRS(value: number) {
  if (value >= 10_000_000) return `Rs ${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000)    return `Rs ${(value / 100_000).toFixed(1)}L`;
  return `Rs ${value.toLocaleString("en-NP")}`;
}

export default async function BidBoardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const orgId = session.user.orgId;

  if (!orgId) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Bid Board</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Super admins do not belong to an organisation. Use the{" "}
          <a href="/admin" className="text-red-600 hover:underline">Admin Panel</a> to manage organisations.
        </div>
      </div>
    );
  }

  // Apply same MEMBER restriction as the projects list
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const hasExplicitAssignments =
    user?.role === "MEMBER"
      ? (await prisma.projectMember.count({ where: { userId: session.user.id } })) > 0
      : false;

  const where: any = {
    orgId,
    ...(hasExplicitAssignments && {
      members: { some: { userId: session.user.id } },
    }),
  };

  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      members: {
        include: { user: { select: { id: true, name: true } } },
        take: 3,
      },
    },
  });

  const grouped = COLUMNS.map((col) => {
    const colProjects = projects.filter((p) => p.status === col.status);
    const totalValue = colProjects.reduce((sum, p) => sum + (p.estimatedValue ?? 0), 0);
    return { ...col, projects: colProjects, totalValue };
  });

  const isAdmin = ["OWNER", "ADMIN"].includes(session.user.role);
  const grandTotal = projects.reduce((sum, p) => sum + (p.estimatedValue ?? 0), 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bid Board</h1>
          <p className="text-gray-500 text-sm mt-1">
            {projects.length} active project{projects.length !== 1 ? "s" : ""}
            {grandTotal > 0 && (
              <span className="ml-2 text-blue-600 font-medium">
                · Total pipeline: {formatNRS(grandTotal)}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/projects"
            className="text-sm text-gray-600 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            List View
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/projects/new"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              + New Project
            </Link>
          )}
        </div>
      </div>

      {/* Column summary */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-1">
        {grouped.map((col) => (
          <div
            key={col.status}
            className="flex-shrink-0 bg-white border border-gray-200 rounded-lg px-4 py-3 min-w-[140px]"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <div className={`w-2 h-2 rounded-full ${col.color}`} />
              <span className="text-xs text-gray-500 font-medium">{col.label}</span>
            </div>
            <div className="text-xl font-bold text-gray-800">{col.projects.length}</div>
            {col.totalValue > 0 && (
              <div className="text-xs text-blue-600 font-medium mt-0.5">{formatNRS(col.totalValue)}</div>
            )}
          </div>
        ))}
      </div>

      <BidBoardClient grouped={grouped} isAdmin={isAdmin} />
    </div>
  );
}
