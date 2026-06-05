import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/ProjectStatusBadge";
import { ShareApprovalForm } from "@/components/ui/ShareApprovalForm";

export default async function SharePage({ params }: { params: { token: string } }) {
  const link = await prisma.shareLink.findUnique({
    where: { token: params.token },
    include: {
      project: {
        include: {
          members: { include: { user: { select: { name: true } } } },
          _count: { select: { drawings: true, disciplines: true } },
          disciplines: {
            include: {
              _count: { select: { groups: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!link || !link.isActive) notFound();

  if (link.expiresAt && link.expiresAt < new Date()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center max-w-sm w-full">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link Expired</h1>
          <p className="text-sm text-gray-500">This share link expired on {link.expiresAt.toLocaleDateString()}. Please request a new link from the project owner.</p>
        </div>
      </div>
    );
  }

  await prisma.shareLink.update({ where: { id: link.id }, data: { viewCount: { increment: 1 } } });

  const p = link.project;
  const alreadyResponded = !!link.approvalStatus;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto py-12 px-4 space-y-6">

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-bold text-lg text-blue-700">NepaliEstimate</span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">Project Proposal</span>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
              {p.description && <p className="text-gray-500 text-sm mt-1">{p.description}</p>}
            </div>
            <ProjectStatusBadge status={p.status} />
          </div>
        </div>

        {/* Project details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Project Details</h2>
          <div className="grid grid-cols-2 gap-4">
            {p.clientName && <div><p className="text-xs text-gray-400">Client</p><p className="text-sm font-medium text-gray-700">{p.clientName}</p></div>}
            {p.clientCompany && <div><p className="text-xs text-gray-400">Company</p><p className="text-sm font-medium text-gray-700">{p.clientCompany}</p></div>}
            {p.district && <div><p className="text-xs text-gray-400">District</p><p className="text-sm font-medium text-gray-700">{p.district}</p></div>}
            {(p as any).bidDueDate && <div><p className="text-xs text-gray-400">Bid Due Date</p><p className="text-sm font-medium text-gray-700">{new Date((p as any).bidDueDate).toLocaleDateString()}</p></div>}
            <div><p className="text-xs text-gray-400">Unit System</p><p className="text-sm font-medium text-gray-700">{p.unitSystem}</p></div>
            <div><p className="text-xs text-gray-400">VAT</p><p className="text-sm font-medium text-gray-700">{p.vatEnabled ? `${p.vatRate}%` : "Not applicable"}</p></div>
          </div>
        </div>

        {/* Scope summary */}
        {p.disciplines.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Scope of Work</h2>
            <div className="space-y-2">
              {p.disciplines.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-sm text-gray-700">{d.name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{d._count.groups} takeoff groups</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{p._count.drawings}</div>
            <div className="text-xs text-gray-500 mt-1">Drawings</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{p.members.length}</div>
            <div className="text-xs text-gray-500 mt-1">Team Members</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-orange-500">{p._count.disciplines}</div>
            <div className="text-xs text-gray-500 mt-1">Disciplines</div>
          </div>
        </div>

        {/* Approval */}
        {alreadyResponded ? (
          <div className={`rounded-xl border p-6 text-center ${link.approvalStatus === "APPROVED" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            <p className="text-2xl mb-2">{link.approvalStatus === "APPROVED" ? "✅" : "❌"}</p>
            <p className={`font-semibold text-lg ${link.approvalStatus === "APPROVED" ? "text-green-700" : "text-red-700"}`}>
              Proposal {link.approvalStatus === "APPROVED" ? "Approved" : "Rejected"} by {link.clientName}
            </p>
            {link.approvalNote && <p className="text-sm text-gray-600 mt-2">"{link.approvalNote}"</p>}
            <p className="text-xs text-gray-400 mt-2">{link.approvedAt ? new Date(link.approvedAt).toLocaleString() : ""}</p>
          </div>
        ) : (
          <ShareApprovalForm token={params.token} clientEmail={link.clientEmail} />
        )}

        <p className="text-xs text-gray-400 text-center">Shared via NepaliEstimate</p>
      </div>
    </div>
  );
}
