import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/ProjectStatusBadge";

export default async function SharePage({ params }: { params: { token: string } }) {
  const link = await prisma.shareLink.findUnique({
    where: { token: params.token },
    include: {
      project: {
        include: {
          members: { include: { user: { select: { name: true } } } },
          _count: { select: { drawings: true, disciplines: true } },
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

  // Increment view count
  await prisma.shareLink.update({ where: { id: link.id }, data: { viewCount: { increment: 1 } } });

  const p = link.project;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-bold text-lg text-blue-700">NepaliEstimate</span>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">Read-only view</span>
          </div>

          <hr className="my-4" />

          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
              {p.description && <p className="text-gray-500 text-sm mt-1">{p.description}</p>}
            </div>
            <ProjectStatusBadge status={p.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            {p.district && (
              <div><span className="text-xs text-gray-400 uppercase">District</span>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{p.district}</p></div>
            )}
            {p.seismicZone && (
              <div><span className="text-xs text-gray-400 uppercase">Seismic Zone</span>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{p.seismicZone}</p></div>
            )}
            <div><span className="text-xs text-gray-400 uppercase">Unit System</span>
              <p className="text-sm font-medium text-gray-700 mt-0.5">{p.unitSystem}</p></div>
            <div><span className="text-xs text-gray-400 uppercase">VAT</span>
              <p className="text-sm font-medium text-gray-700 mt-0.5">
                {p.vatEnabled ? `${p.vatRate}%` : "Not applicable"}
              </p></div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{p._count.drawings}</div>
              <div className="text-xs text-gray-500 mt-1">Drawings</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{p.members.length}</div>
              <div className="text-xs text-gray-500 mt-1">Team Members</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-500">{p._count.disciplines}</div>
              <div className="text-xs text-gray-500 mt-1">Disciplines</div>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center">
            Shared via NepaliEstimate · Read-only access
          </p>
        </div>
      </div>
    </div>
  );
}
