import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { getDownloadUrl } from "@/lib/upload";
import dynamic from "next/dynamic";
import { getOrCreateDisciplines } from "@/lib/disciplines";

// DrawingCanvas uses Konva which requires browser APIs (DOMMatrix) — disable SSR
const DrawingCanvas = dynamic(
  () => import("@/components/canvas/DrawingCanvas").then((m) => m.DrawingCanvas),
  { ssr: false }
);

export default async function DrawingViewerPage({
  params,
}: {
  params: { id: string; drawingId: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect("/");

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, orgId: true, unitSystem: true },
  });

  if (!project || project.orgId !== session.user.orgId) notFound();

  const drawing = await prisma.drawing.findUnique({
    where: { id: params.drawingId },
    include: {
      pages: {
        orderBy: { pageNumber: "asc" },
        include: { scaleZones: true },
      },
    },
  });

  if (!drawing || drawing.projectId !== params.id) notFound();

  const [downloadUrl, allDrawings, takeoffGroups, disciplines] = await Promise.all([
    getDownloadUrl(drawing.fileUrl),
    prisma.drawing.findMany({
      where: { projectId: params.id, isLatest: true },
      select: { id: true, fileName: true, revisionNumber: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.takeoffGroup.findMany({
      where: { projectId: params.id },
      include: {
        _count: { select: { items: true } },
        rateItem: { select: { code: true, source: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
    getOrCreateDisciplines(params.id),
  ]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-1 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <a
          href={`/dashboard/projects/${params.id}?tab=documents`}
          className="text-gray-600 hover:text-white text-sm transition"
        >
          ← {project.name}
        </a>
        <span className="text-gray-600">/</span>
        <span className="text-gray-200 text-sm font-medium truncate max-w-xs">{drawing.fileName}</span>
        {drawing.revisionNumber && (
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{drawing.revisionNumber}</span>
        )}
      </header>

      {/* Canvas (includes sidebar internally) */}
      <div className="flex-1 overflow-hidden">
        <DrawingCanvas
          key={params.drawingId}
          projectId={params.id}
          drawing={{
            id: drawing.id,
            fileName: drawing.fileName,
            downloadUrl,
            pages: drawing.pages.map((p) => ({
              id: p.id,
              pageNumber: p.pageNumber,
              label: p.label,
              scale: p.scale,
              scaleUnit: p.scaleUnit,
              canvasJson: p.canvasJson as Record<string, unknown> | null,
              annotationsJson: p.annotationsJson as Record<string, unknown> | null,
              scaleZones: p.scaleZones,
            })),
          }}
          unitSystem={project.unitSystem}
          initialGroups={takeoffGroups.map((g) => ({
            id: g.id,
            name: g.name,
            type: g.type,
            colour: g.colour,
            lineWidth: g.lineWidth,
            isLocked: g.isLocked,
            isVisible: g.isVisible,
            tag: g.tag,
            preamble: g.preamble,
            rateItemId: g.rateItemId,
            rateItem: (g as any).rateItem ?? null,
            assemblyId: g.assemblyId ?? null,
            assembly: (g as any).assembly ?? null,
            multiplier: g.multiplier,
            additionalParams: g.additionalParams as Record<string, unknown> | null,
            parentId: g.parentId,
            disciplineId: g.disciplineId,
            sortOrder: g.sortOrder,
            _count: g._count,
          }))}
          initialDisciplines={disciplines.map((d) => ({
            id: d.id,
            name: d.name,
            sortOrder: d.sortOrder,
            isPrimary: d.isPrimary,
            _count: d._count,
          }))}
          allDrawings={allDrawings.map((d) => ({
            id: d.id,
            fileName: d.fileName,
          }))}
          currentUser={{ id: session.user.id, name: session.user.name ?? "Unknown" }}
        />
      </div>
    </div>
  );
}
