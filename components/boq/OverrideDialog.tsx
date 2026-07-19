"use client";

import { useState } from "react";
import type { BOQGroup } from "@/lib/boq";
import { fmtNum } from "@/lib/format";

interface Props {
  projectId: string;
  group: BOQGroup;
  onClose: () => void;
  onSuccess: () => void;
}

export function OverrideDialog({ projectId, group, onClose, onSuccess }: Props) {
  const [proposedValue, setProposedValue] = useState(group.rate.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const val = parseFloat(proposedValue);
    if (isNaN(val) || val < 0) {
      setError("Enter a valid rate (≥ 0).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/boq/overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateItemId: group.rateItemId,
          field: "rate",
          proposedValue: val.toString(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to submit override");
      }
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Propose Rate Override</h2>

        <div className="space-y-3 text-sm mb-5">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Item</span>
            <span className="font-medium text-gray-800 dark:text-gray-100">{group.name}</span>
          </div>
          {group.rateCode && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Rate Code</span>
              <span className="font-mono text-gray-700 dark:text-gray-300">{group.rateCode}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Current Rate</span>
            <span className="font-medium text-gray-800 dark:text-gray-100">NRS {fmtNum(group.rate, 2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Unit</span>
            <span className="text-gray-700 dark:text-gray-300">{group.unit}</span>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Proposed Rate (NRS per {group.unit || "unit"})
          </label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400 text-sm">NRS</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={proposedValue}
              onChange={(e) => setProposedValue(e.target.value)}
              disabled={!!group.pendingOverride}
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>

        {group.pendingOverride && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3 text-xs text-orange-700 dark:text-orange-300 mb-4">
            A pending override for NRS {fmtNum(parseFloat(group.pendingOverride.proposedValue), 2)} is awaiting approval. Wait for the existing one to be reviewed before submitting a new one.
          </div>
        )}

        {error && <p className="text-red-500 dark:text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !!group.pendingOverride}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Submitting…" : group.pendingOverride ? "Override Pending" : "Submit Override"}
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
          Override requires approval from an Admin or Owner before taking effect.
        </p>
      </div>
    </div>
  );
}
