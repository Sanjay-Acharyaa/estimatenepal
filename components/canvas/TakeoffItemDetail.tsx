"use client";

import { useState, useMemo } from "react";
import type { TakeoffItem } from "./types";
import { getWastageDefault } from "@/lib/wastageDefaults";

type Props = {
  item: TakeoffItem;
  projectId: string;
  drawingId: string;
  pageId: string;
  onClose: () => void;
  onUpdated: (item: TakeoffItem) => void;
};

export function TakeoffItemDetail({ item, projectId, drawingId, pageId, onClose, onUpdated }: Props) {
  const [label, setLabel] = useState(item.label);
  const [wastagePct, setWastagePct] = useState(String(item.wastagePct ?? 0));
  const [siteLocation, setSiteLocation] = useState(item.siteLocation ?? "");
  const [measuredDate, setMeasuredDate] = useState(
    item.measuredDate ? item.measuredDate.slice(0, 10) : ""
  );
  const [notes, setNotes] = useState(item.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ label?: string; wastagePct?: string }>({});

  const wastageSuggestion = useMemo(() => getWastageDefault(label), [label]);

  const qtyDisplay = item.unit === "each"
    ? `${Math.round(item.quantity)} ${item.unit}`
    : `${item.quantity.toFixed(2)} ${item.unit}`;

  async function handleSave() {
    const pct = parseFloat(wastagePct);
    const fe: typeof fieldErrors = {};
    if (!label.trim()) fe.label = "Label cannot be empty.";
    if (isNaN(pct) || pct < 0 || pct > 100) fe.wastagePct = "Wastage % must be between 0 and 100.";
    if (Object.keys(fe).length) { setFieldErrors(fe); return; }
    setFieldErrors({});
    setError("");
    setSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/drawings/${drawingId}/pages/${pageId}/takeoff-items/${item.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: label.trim(),
            wastagePct: pct,
            siteLocation: siteLocation.trim() || null,
            measuredDate: measuredDate ? new Date(measuredDate).toISOString() : null,
            notes: notes.trim() || null,
            version: item.version,
          }),
        }
      );
      if (res.ok) {
        onUpdated(await res.json());
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d?.error?.message ?? "Failed to save.");
      }
    } catch {
      setError("Network error.");
    }
    setSaving(false);
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-2xl border-l border-gray-200 z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="min-w-0">
          <p className="text-xs text-gray-600 uppercase font-semibold mb-0.5">Shape detail</p>
          <p className="text-sm font-semibold text-gray-800 truncate">{item.label}</p>
        </div>
        <button onClick={onClose} aria-label="Close shape detail" className="text-gray-600 hover:text-gray-600 text-xl leading-none ml-2 flex-shrink-0">×</button>
      </div>

      {/* Quantity badge */}
      <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
        <p className="text-xs text-gray-500 mb-0.5">BOQ quantity (net measured)</p>
        <p className="text-lg font-bold text-gray-800">{qtyDisplay}</p>
        {item.wastagePct > 0 && (
          <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <p className="text-xs text-amber-700 font-medium">
              Material to order: {(item.unit === "each"
                ? Math.round(item.quantity * (1 + item.wastagePct / 100))
                : (item.quantity * (1 + item.wastagePct / 100)).toFixed(2)
              )} {item.unit}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {qtyDisplay} + {item.wastagePct}% wastage — for procurement only, not billed
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {error && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded">{error}</p>
        )}

        <div>
          <label htmlFor="tid-label" className="block text-xs text-gray-700 mb-1">Label</label>
          <input
            id="tid-label"
            value={label}
            onChange={e => { setLabel(e.target.value); setFieldErrors(f => ({ ...f, label: undefined })); }}
            aria-describedby={fieldErrors.label ? "tid-label-err" : undefined}
            aria-invalid={!!fieldErrors.label}
            className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ${fieldErrors.label ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-blue-500"}`}
          />
          {fieldErrors.label && <p id="tid-label-err" role="alert" className="text-red-600 text-xs mt-1">{fieldErrors.label}</p>}
        </div>

        <div>
          <label htmlFor="tid-wastage" className="block text-xs text-gray-700 mb-1">
            Wastage %
            <span className="text-gray-600 font-normal ml-1">(added on top of quantity)</span>
          </label>
          <input
            id="tid-wastage"
            type="number" min="0" max="100" step="0.5"
            value={wastagePct}
            onChange={e => { setWastagePct(e.target.value); setFieldErrors(f => ({ ...f, wastagePct: undefined })); }}
            aria-describedby={fieldErrors.wastagePct ? "tid-wastage-err" : undefined}
            aria-invalid={!!fieldErrors.wastagePct}
            className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ${fieldErrors.wastagePct ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-blue-500"}`}
          />
          {fieldErrors.wastagePct && <p id="tid-wastage-err" role="alert" className="text-red-600 text-xs mt-1">{fieldErrors.wastagePct}</p>}
          {wastageSuggestion && parseFloat(wastagePct) === 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-500">Suggested for this material:</span>
              <button
                type="button"
                onClick={() => setWastagePct(String(wastageSuggestion.pct))}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-300 text-amber-800 text-xs rounded-full hover:bg-amber-100 transition"
              >
                <span className="font-semibold">{wastageSuggestion.pct}%</span>
                <span className="text-amber-600">— {wastageSuggestion.reason}</span>
              </button>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="tid-site-location" className="block text-xs text-gray-700 mb-1">Site location</label>
          <input
            id="tid-site-location"
            value={siteLocation} onChange={e => setSiteLocation(e.target.value)}
            placeholder="e.g. Block A, Ground Floor"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="tid-date-measured" className="block text-xs text-gray-700 mb-1">Date measured</label>
          <input
            id="tid-date-measured"
            type="date"
            value={measuredDate} onChange={e => setMeasuredDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="tid-notes" className="block text-xs text-gray-700 mb-1">Notes</label>
          <textarea
            id="tid-notes"
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={4} placeholder="Any remarks about this measurement…"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Read-only info */}
        <div className="border-t border-gray-100 pt-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Tool</span>
            <span className="text-gray-600 font-medium">{item.toolType}{item.shapeType ? ` · ${item.shapeType}` : ""}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Scale used</span>
            <span className="text-gray-600 font-medium">{item.scaleUsed.toFixed(5)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200">
        <button
          onClick={handleSave} disabled={saving}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onClose}
          className="px-3 py-2 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
