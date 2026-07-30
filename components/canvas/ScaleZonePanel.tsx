"use client";

import { useState } from "react";

type Props = {
  defaultUnit: string;
  defaultScale?: number;
  onSave: (scale: number, unit: string, label: string) => void;
  onCancel: () => void;
};

const UNITS = ["m", "ft"];

export function ScaleZonePanel({ defaultUnit, defaultScale, onSave, onCancel }: Props) {
  const [scale, setScale] = useState(defaultScale ? String(defaultScale) : "");
  const [unit, setUnit] = useState(UNITS.includes(defaultUnit) ? defaultUnit : "m");
  const [label, setLabel] = useState("");
  const [fieldError, setFieldError] = useState("");

  function handleSave() {
    const val = parseFloat(scale);
    if (!val || val <= 0) {
      setFieldError("Enter a positive scale value.");
      return;
    }
    setFieldError("");
    onSave(val, unit, label);
  }

  return (
    <div
      className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="szp-title"
      onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
        <h3 id="szp-title" className="font-bold text-gray-900 mb-1">Scale Zone</h3>
        <p className="text-xs text-gray-500 mb-4">
          Set the scale for this region. It will override the page scale inside the zone.
        </p>

        {fieldError && <p id="szp-scale-err" role="alert" className="text-red-600 text-xs mb-2">{fieldError}</p>}

        <div className="space-y-3 mb-4">
          <div>
            <label htmlFor="szp-label" className="block text-xs font-medium text-gray-700 mb-1">Label (optional)</label>
            <input
              id="szp-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Ground Floor, North Wing"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label htmlFor="szp-scale" className="block text-xs font-medium text-gray-700 mb-1">Scale (real-world units / px)</label>
            <div className="flex gap-2">
              <input
                id="szp-scale"
                type="number"
                min="0.000001"
                step="any"
                value={scale}
                onChange={(e) => { setScale(e.target.value); setFieldError(""); }}
                placeholder="e.g. 0.05"
                autoFocus
                aria-describedby={fieldError ? "szp-scale-err" : undefined}
                aria-invalid={!!fieldError}
                className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${fieldError ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-green-500"}`}
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                aria-label="Scale unit"
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            {defaultScale && (
              <button
                type="button"
                onClick={() => setScale(String(defaultScale))}
                className="text-xs text-green-600 hover:underline mt-1"
              >
                Use page scale ({defaultScale.toFixed(6)})
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg text-sm transition"
          >
            Save Zone
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
