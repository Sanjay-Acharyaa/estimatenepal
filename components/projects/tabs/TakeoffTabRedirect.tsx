"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Drawing = { id: string; fileName: string; folderId: string | null };

export function TakeoffTabRedirect({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/drawings?limit=100&isLatest=1`)
      .then(r => r.json())
      .then(d => setDrawings(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // Auto-redirect to first drawing if exactly one exists
  useEffect(() => {
    if (!loading && drawings.length === 1) {
      router.replace(`/dashboard/projects/${projectId}/drawings/${drawings[0].id}`);
    }
  }, [loading, drawings, projectId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400 text-sm">Loading drawings…</p>
      </div>
    );
  }

  if (drawings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
        <div className="text-5xl">📐</div>
        <h2 className="text-lg font-semibold text-gray-700">No drawings yet</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          Upload your PDF drawings in the Documents tab first, then return here to start takeoff.
        </p>
        <Link
          href={`/dashboard/projects/${projectId}?tab=documents`}
          className="px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition"
        >
          Go to Documents →
        </Link>
      </div>
    );
  }

  // Multiple drawings — show a picker
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
      <div className="text-5xl">📐</div>
      <h2 className="text-lg font-semibold text-gray-700">Select a drawing to start takeoff</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-2xl">
        {drawings.slice(0, 12).map(d => (
          <Link
            key={d.id}
            href={`/dashboard/projects/${projectId}/drawings/${d.id}`}
            className="flex items-center gap-2.5 px-4 py-3 border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition text-left"
          >
            <span className="text-2xl">📄</span>
            <span className="text-sm font-medium text-gray-700 truncate">{d.fileName}</span>
          </Link>
        ))}
      </div>
      {drawings.length > 12 && (
        <p className="text-xs text-gray-400">
          Showing 12 of {drawings.length} drawings.{" "}
          <Link href={`/dashboard/projects/${projectId}?tab=documents`} className="text-blue-600 hover:underline">
            See all in Documents →
          </Link>
        </p>
      )}
    </div>
  );
}
