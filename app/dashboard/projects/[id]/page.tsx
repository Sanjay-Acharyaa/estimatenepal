import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { OverviewTab } from "@/components/projects/tabs/OverviewTab";
import { DocumentsTab } from "@/components/projects/tabs/DocumentsTab";
import { EstimatingTab } from "@/components/projects/tabs/EstimatingTab";
import { ProposalTab } from "@/components/projects/tabs/ProposalTab";
import { TakeoffTabRedirect } from "@/components/projects/tabs/TakeoffTabRedirect";
import { ProjectStatusBadge } from "@/components/ui/ProjectStatusBadge";
import { SaveAsAssemblyButton } from "@/components/assemblies/SaveAsAssemblyButton";

const TABS = [
  { key: "overview",    label: "Overview" },
  { key: "documents",   label: "Documents" },
  { key: "takeoff",     label: "Takeoff" },
  { key: "estimating",  label: "Estimating" },
  { key: "proposal",    label: "Proposal" },
] as const;
type TabKey = typeof TABS[number]["key"];

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect("/");

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { assignedAt: "asc" },
      },
      _count: { select: { drawings: true, disciplines: true } },
    },
  });

  if (!project || project.orgId !== session.user.orgId) notFound();

  const isAdmin = ["OWNER", "ADMIN"].includes(session.user.role);
  const activeTab: TabKey = (TABS.find(t => t.key === searchParams.tab)?.key) ?? "overview";

  const orgUsers = isAdmin
    ? await prisma.user.findMany({
        where: { orgId: session.user.orgId! },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Top bar: breadcrumb + project name + status ── */}
      <div className="px-6 pt-4 pb-0 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-600 mb-1">
              <Link href="/dashboard/bid-board" className="hover:text-gray-600">Bid Board</Link>
              <span className="mx-1">›</span>
              <span className="text-gray-600 font-medium truncate">{project.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-gray-900 truncate max-w-xl">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
              {(project as any).priority === "HIGH" && (
                <span aria-label="High priority" className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                  <span aria-hidden>H</span>
                </span>
              )}
              {(project as any).priority === "MEDIUM" && (
                <span aria-label="Medium priority" className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">
                  <span aria-hidden>M</span>
                </span>
              )}
              {(project as any).priority === "LOW" && (
                <span aria-label="Low priority" className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-600">
                  <span aria-hidden>L</span>
                </span>
              )}
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/dashboard/projects/${project.id}/change-orders`}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
            >
              Changes
            </Link>
            <Link
              href={`/dashboard/projects/${project.id}/progress`}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
            >
              Progress
            </Link>
            <Link
              href={`/dashboard/projects/${project.id}/boq`}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
            >
              BOQ
            </Link>
            <a
              href={`/api/auth/sso-token?return_to=${encodeURIComponent(`/tenders/new?estimationProjectId=${project.id}`)}`}
              className="text-sm px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition font-medium"
            >
              Create Tender
            </a>
            {isAdmin && <SaveAsAssemblyButton projectId={project.id} />}
          </div>
        </div>

        {/* ── Tab bar ── */}
        <nav aria-label="Project sections" className="flex gap-0 -mb-px">
          {TABS.map(tab => (
            <Link
              key={tab.key}
              href={`/dashboard/projects/${project.id}?tab=${tab.key}`}
              aria-current={activeTab === tab.key ? "page" : undefined}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
              {tab.key === "estimating" && project._count.disciplines > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded px-1" aria-hidden>{project._count.disciplines}</span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "overview" && (
          <OverviewTab
            project={project as any}
            orgUsers={orgUsers}
            isAdmin={isAdmin}
            currentUserId={session.user.id}
          />
        )}
        {activeTab === "documents" && (
          <DocumentsTab
            project={project as any}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === "takeoff" && (
          <TakeoffTabRedirect projectId={project.id} />
        )}
        {activeTab === "estimating" && (
          <EstimatingTab projectId={project.id} />
        )}
        {activeTab === "proposal" && (
          <ProposalTab projectId={project.id} userRole={session.user.role} />
        )}
      </div>
    </div>
  );
}
