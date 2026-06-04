"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/hooks/useConfirm";

type Props = { projectId: string };

type Status = { needsMigration: boolean; latestFY: string | null; projectFY: string | null };

export function RateMigrationBanner({ projectId }: Props) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [status, setStatus] = useState<Status | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<{ migrated: number; unmatched: number; targetFY: string } | null>(null);
  const [migrateError, setMigrateError] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/rate-migration`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStatus(d); })
      .catch(() => {});
  }, [projectId]);

  async function handleMigrate() {
    const ok = await confirm({ title: "Update Rates", message: `Migrate all DUDBC-linked layers to FY ${status?.latestFY}? This updates rate links but keeps all quantities unchanged.`, confirmLabel: "Update Rates", variant: "warning" });
    if (!ok) return;
    setMigrating(true);
    setMigrateError("");
    const res = await fetch(`/api/projects/${projectId}/rate-migration`, { method: "POST" });
    const d = await res.json();
    setMigrating(false);
    if (res.ok) {
      setResult(d);
      setStatus(s => s ? { ...s, needsMigration: false } : s);
    } else {
      setMigrateError(d?.error?.message ?? "Migration failed. Please try again.");
    }
  }

  if (dismissed || !status?.needsMigration) return null;

  return (
    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
      {confirmDialog}
      <span className="text-amber-500 text-lg mt-0.5">⚠</span>
      <div className="flex-1 min-w-0">
        {migrateError && (
          <p className="text-sm text-red-700 font-medium">{migrateError}</p>
        )}
        {result ? (
          <p className="text-sm text-green-700 font-medium">
            ✓ Migrated {result.migrated} layer{result.migrated !== 1 ? "s" : ""} to FY {result.targetFY}.
            {result.unmatched > 0 && ` ${result.unmatched} layer(s) had no matching code and were left unchanged.`}
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-amber-800">
              New DUDBC rates available (FY {status.latestFY})
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              This project is linked to FY {status.projectFY} rates. Update to use the latest published rates.
              Quantities are not affected — only rate links are updated.
            </p>
          </>
        )}
      </div>
      {!result && (
        <button onClick={handleMigrate} disabled={migrating}
          className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50">
          {migrating ? "Migrating…" : "Update Rates"}
        </button>
      )}
      <button onClick={() => setDismissed(true)} className="flex-shrink-0 text-amber-400 hover:text-amber-600 text-lg leading-none">×</button>
    </div>
  );
}
