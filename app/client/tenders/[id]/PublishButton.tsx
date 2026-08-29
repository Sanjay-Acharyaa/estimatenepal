"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  tenderId: number;
  boqChapterCount: number;
  bidDeadline: string;
}

export default function PublishButton({ tenderId, boqChapterCount, bidDeadline }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deadlinePast = new Date(bidDeadline) <= new Date();

  async function handlePublish() {
    if (boqChapterCount === 0) {
      setError("Add at least one BOQ chapter before publishing.");
      return;
    }
    if (deadlinePast) {
      setError("Bid deadline must be in the future.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to publish.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handlePublish}
        disabled={loading || boqChapterCount === 0 || deadlinePast}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? "Publishing…" : "Publish tender"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
