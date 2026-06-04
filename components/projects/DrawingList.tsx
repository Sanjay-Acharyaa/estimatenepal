"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DrawingUpload } from "./DrawingUpload";

type DrawingPage = {
  id: string;
  pageNumber: number;
  label: string | null;
  scale: number | null;
  scaleUnit: string;
};
type Drawing = {
  id: string;
  fileName: string;
  pageCount: number;
  revisionNumber: string | null;
  createdAt: string;
  pages: DrawingPage[];
  _count: { revisions: number };
};
type Pagination = { page: number; limit: number; total: number; totalPages: number };

const PAGE_SIZE = 10;

export function DrawingList({ projectId }: { projectId: string }) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [revisionFor, setRevisionFor] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchDrawings = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/drawings?page=${p}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setDrawings(data.data);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchDrawings(page); }, [page, fetchDrawings]);

  async function handleDelete(drawingId: string, fileName: string) {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    setDeleting(drawingId);
    await fetch(`/api/projects/${projectId}/drawings/${drawingId}`, { method: "DELETE" });
    setDeleting(null);
    fetchDrawings(page);
  }

  function handleUploadDone() {
    setShowUpload(false);
    setRevisionFor(undefined);
    // Go back to page 1 to see the new drawing
    if (page === 1) fetchDrawings(1);
    else setPage(1);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800">
          Drawings
          {pagination && (
            <span className="ml-2 text-xs text-gray-400 font-normal">
              ({pagination.total} total)
            </span>
          )}
        </h2>
        <button
          onClick={() => { setRevisionFor(undefined); setShowUpload(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
        >
          + Upload Drawing
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : drawings.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          No drawings yet.{" "}
          <button onClick={() => setShowUpload(true)} className="text-blue-600 hover:underline">
            Upload the first one
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {drawings.map((d) => (
              <div
                key={d.id}
                className={`flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 group transition ${
                  deleting === d.id ? "opacity-40 pointer-events-none" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-red-100 text-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{d.fileName}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                      <span>{d.pageCount} page{d.pageCount !== 1 ? "s" : ""}</span>
                      {d.revisionNumber && (
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                          {d.revisionNumber}
                        </span>
                      )}
                      {d._count.revisions > 0 && (
                        <span>{d._count.revisions} revision{d._count.revisions !== 1 ? "s" : ""}</span>
                      )}
                      <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition flex-shrink-0 ml-3">
                  <button
                    onClick={() => { setRevisionFor(d.id); setShowUpload(true); }}
                    className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2 py-1 rounded"
                    title="Upload revision"
                  >
                    Revise
                  </button>
                  <Link
                    href={`/dashboard/projects/${projectId}/drawings/${d.id}`}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 px-2 py-1 rounded"
                  >
                    Open →
                  </Link>
                  <button
                    onClick={() => handleDelete(d.id, d.fileName)}
                    className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-2 py-1 rounded"
                    title="Delete drawing"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showUpload && (
        <DrawingUpload
          projectId={projectId}
          parentDrawingId={revisionFor}
          onClose={handleUploadDone}
        />
      )}
    </div>
  );
}
