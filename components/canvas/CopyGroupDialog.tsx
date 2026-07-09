"use client";

import { useState } from "react";
import type { TakeoffGroup } from "./TakeoffPanel";
import type { Discipline } from "./DrawingCanvas";

type Props = {
  group: TakeoffGroup;
  isCategory: boolean;
  childLayerCount: number;
  disciplines: Discipline[];
  activeDisciplineId: string | null;
  projectId: string;
  groups: TakeoffGroup[];
  onCopied: (result: { category?: TakeoffGroup; layers?: TakeoffGroup[]; layer?: TakeoffGroup; targetParentId?: string | null; copiedItems?: unknown[] }, withObjects: boolean) => void;
  onCancel: () => void;
};

export function CopyGroupDialog({ group, isCategory, childLayerCount, disciplines, activeDisciplineId, projectId, groups, onCopied, onCancel }: Props) {
  const [targetDisciplineId, setTargetDisciplineId] = useState(activeDisciplineId ?? disciplines[0]?.id ?? "");
  const [targetGroupId, setTargetGroupId] = useState("");
  const [withObjects, setWithObjects] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCopy() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/takeoff-groups/${group.id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDisciplineId, withObjects, ...(targetGroupId ? { targetGroupId } : {}) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error?.message ?? "Copy failed.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      onCopied(data, withObjects);
    } catch {
      setError("Network error.");
      setLoading(false);
    }
  }

  const targetTabName = disciplines.find(d => d.id === targetDisciplineId)?.name ?? "";
  const isSameTab = targetDisciplineId === activeDisciplineId;
  const availableGroups = groups.filter(g => g.parentId === null && g.disciplineId === targetDisciplineId);
  const selectedGroupName = availableGroups.find(g => g.id === targetGroupId)?.name ?? "";

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cgd-title"
      onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm p-5">
        <h3 id="cgd-title" className="text-sm font-semibold text-gray-800 mb-1">
          Copy {isCategory ? "Group" : "Layer"}
        </h3>
        <p className="text-xs text-gray-500 mb-4 truncate">"{group.name}"</p>

        {error && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded mb-3">{error}</p>
        )}

        {/* Destination tab */}
        <div className="mb-3">
          <label htmlFor="cgd-target-tab" className="block text-xs font-medium text-gray-700 mb-1.5">Copy to tab</label>
          <select
            id="cgd-target-tab"
            value={targetDisciplineId}
            onChange={e => { setTargetDisciplineId(e.target.value); setTargetGroupId(""); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {disciplines.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}{d.id === activeDisciplineId ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Destination group — only for layer copies */}
        {!isCategory && availableGroups.length > 0 && (
          <div className="mb-4">
            <label htmlFor="cgd-target-group" className="block text-xs font-medium text-gray-700 mb-1.5">Copy into group</label>
            <select
              id="cgd-target-group"
              value={targetGroupId}
              onChange={e => setTargetGroupId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">
                {groups.find(g => g.id === group.parentId)?.name ?? "Current group"} (default)
              </option>
              {availableGroups.filter(g => g.id !== group.parentId).map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* With objects toggle */}
        <div className="mb-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={withObjects}
              onChange={e => setWithObjects(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="text-xs font-medium text-gray-700 block">
                Include measured shapes
              </span>
              <span className="text-xs text-gray-600">
                Copies all quantities from all drawings
              </span>
            </span>
          </label>
        </div>

        {/* Summary */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4 text-xs text-blue-700">
          {isCategory ? (
            <>
              Copy group &ldquo;{group.name}&rdquo; with{" "}
              <strong>{childLayerCount} layer{childLayerCount !== 1 ? "s" : ""}</strong>
              {withObjects ? " + all measured shapes" : " (structure only)"}
              {" "}→ <strong>{targetTabName}</strong>
            </>
          ) : (
            <>
              Copy layer &ldquo;{group.name}&rdquo;{withObjects ? " + all measured shapes" : " (no shapes)"} →{" "}
              <strong>{selectedGroupName || (isSameTab ? "same group" : targetTabName)}</strong>
              {selectedGroupName && !isSameTab && <> ({targetTabName})</>}
            </>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            disabled={loading || !targetDisciplineId}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Copying…" : "Copy"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
