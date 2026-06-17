"use client";

import { useState } from "react";

type Props = {
  pixelLength: number;
  currentUnit: string;
  onSave: (realLength: number, unit: string) => void;
  onCancel: () => void;
};

const UNITS = ["m", "mm", "ft", "in"];

export function ScaleCalibration({ pixelLength, currentUnit, onSave, onCancel }: Props) {
  const [realLength, setRealLength] = useState("");
  const [unit, setUnit] = useState(UNITS.includes(currentUnit) ? currentUnit : "m");
  const [error, setError] = useState("");

  const [fieldError, setFieldError] = useState("");

  function handleSave() {
    const val = parseFloat(realLength);
    if (!val || val <= 0) {
      setFieldError("Enter a positive number.");
      return;
    }
    setFieldError("");
    onSave(val, unit);
  }

  return (
    <div
      className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sc-title"
      onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
        <h3 id="sc-title" className="font-bold text-gray-900 mb-1">Set Scale</h3>
        <p className="text-xs text-gray-500 mb-4">
          The reference line you drew is{" "}
          <span className="font-semibold text-gray-700">{Math.round(pixelLength)} px</span> long.
          What real-world length does it represent?
        </p>

        <div className="mb-4">
          <div className="flex gap-2">
            <input
              id="sc-real-length"
              type="number"
              min="0.001"
              step="any"
              value={realLength}
              onChange={(e) => { setRealLength(e.target.value); setFieldError(""); }}
              placeholder="e.g. 10"
              autoFocus
              aria-label="Real-world length"
              aria-describedby={fieldError ? "sc-length-err" : undefined}
              aria-invalid={!!fieldError}
              className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${fieldError ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-orange-400"}`}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              aria-label="Unit of measurement"
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {fieldError && <p id="sc-length-err" role="alert" className="text-red-600 text-xs mt-1">{fieldError}</p>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded-lg text-sm transition"
          >
            Apply Scale
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
