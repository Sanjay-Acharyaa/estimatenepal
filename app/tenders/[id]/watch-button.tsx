"use client";

import { useState } from "react";

export default function WatchButton({ tenderId, initialWatching }: { tenderId: number; initialWatching: boolean }) {
  const [watching, setWatching] = useState(initialWatching);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/watch`, {
        method: watching ? "DELETE" : "POST",
      });
      if (res.ok || res.status === 204) {
        setWatching((v) => !v);
      } else if (res.status === 409) {
        setWatching(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message ?? "Something went wrong.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        disabled={busy}
        className={[
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
          watching
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50",
        ].join(" ")}
      >
        <span>{watching ? "★" : "☆"}</span>
        {busy ? "…" : watching ? "Watching" : "Watch"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
