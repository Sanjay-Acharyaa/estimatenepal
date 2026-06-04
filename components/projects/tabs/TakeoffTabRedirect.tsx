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

  useEffect(() => {
    if (loading || drawings.length === 0) return;

    // Restore last-visited drawing, fall back to first
    const lastId = typeof window !== "undefined"
      ? localStorage.getItem(`lastDrawing:${projectId}`)
      : null;

    const target = (lastId && drawings.find(d => d.id === lastId))
      ? lastId
      : drawings[0].id;

    router.replace(`/dashboard/projects/${projectId}/drawings/${target}`);
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

  // Redirecting — show a brief loading state while router.replace fires
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-gray-400 text-sm">Opening drawing…</p>
    </div>
  );
}
