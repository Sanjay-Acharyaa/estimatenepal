"use client";

import { useState } from "react";
import {
  COMMON_SCALES,
  METRIC_SCALES,
  presetToFtPerPx,
  presetToMPerPx,
  type CommonScalePreset,
  type MetricScalePreset,
} from "@/lib/scale";

type Props = {
  /** Non-null once user has drawn a manual reference line */
  pixelLength: number | null;
  /** "m" for metric projects, "ft" for imperial — drives which presets and inputs to show */
  currentUnit: string;
  /** Fired when user switches between Common / Manual so parent can gate line drawing */
  onSubModeChange: (mode: "common" | "manual") => void;
  /**
   * Called for common scale.
   * For imperial: value is ft/px. For metric: value is m/px.
   * The parent applies it with the page's current scaleUnit.
   */
  onApplyCommon: (scale: number) => void;
  /** Called for manual calibration — realFt is the real-world length in feet (always feet internally) */
  onApplyManual: (realFt: number) => void;
  onCancel: () => void;
};

const DEFAULT_IMPERIAL = COMMON_SCALES.find((s) => s.label === '1/8" = 1\'') ?? COMMON_SCALES[5];
const DEFAULT_METRIC = METRIC_SCALES.find((s) => s.label === "1:100") ?? METRIC_SCALES[3];
const IMPERIAL_GROUPS: Array<"Architectural" | "Civil"> = ["Architectural", "Civil"];

export function DrawingScalePanel({
  pixelLength,
  currentUnit,
  onSubModeChange,
  onApplyCommon,
  onApplyManual,
  onCancel,
}: Props) {
  const isMetric = currentUnit === "m";
  const [mode, setMode] = useState<"common" | "manual">("common");

  // Imperial state
  const [imperialPreset, setImperialPreset] = useState<CommonScalePreset>(DEFAULT_IMPERIAL);
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");

  // Metric state
  const [metricPreset, setMetricPreset] = useState<MetricScalePreset>(DEFAULT_METRIC);
  const [meters, setMeters] = useState("");

  function switchMode(m: "common" | "manual") {
    setMode(m);
    onSubModeChange(m);
  }

  const manualReady =
    mode === "manual" &&
    pixelLength !== null &&
    (isMetric
      ? parseFloat(meters) > 0
      : parseFloat(feet) > 0 || parseFloat(inches) > 0);

  const canApply = mode === "common" || manualReady;

  function handleApply() {
    if (mode === "common") {
      if (isMetric) {
        onApplyCommon(presetToMPerPx(metricPreset.ratio));
      } else {
        onApplyCommon(presetToFtPerPx(imperialPreset));
      }
    } else {
      if (pixelLength === null) return;
      if (isMetric) {
        const m = parseFloat(meters);
        if (m <= 0) return;
        // Convert meters to feet for internal storage — canonical storage is always feet
        onApplyManual(m / 0.3048);
      } else {
        const ft = parseFloat(feet) || 0;
        const ins = parseFloat(inches) || 0;
        const totalFt = ft + ins / 12;
        if (totalFt <= 0) return;
        onApplyManual(totalFt);
      }
    }
  }

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-white rounded-xl shadow-2xl w-80 p-5 border border-gray-200">
      <h3 className="text-sm font-bold text-gray-800 mb-4">Drawing Scale</h3>

      {/* Common Scales */}
      <label className="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="radio"
          checked={mode === "common"}
          onChange={() => switchMode("common")}
          className="accent-blue-600"
        />
        <span className="text-sm font-medium text-gray-700">Common Scales</span>
      </label>

      {mode === "common" && (
        <div className="ml-5 mb-3">
          {isMetric ? (
            <select
              value={metricPreset.label}
              onChange={(e) =>
                setMetricPreset(METRIC_SCALES.find((s) => s.label === e.target.value)!)
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <optgroup label="Metric">
                {METRIC_SCALES.map((s) => (
                  <option key={s.label} value={s.label}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            </select>
          ) : (
            <select
              value={imperialPreset.label}
              onChange={(e) =>
                setImperialPreset(COMMON_SCALES.find((s) => s.label === e.target.value)!)
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {IMPERIAL_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {COMMON_SCALES.filter((s) => s.group === group).map((s) => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Manually Set Scale */}
      <label className="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="radio"
          checked={mode === "manual"}
          onChange={() => switchMode("manual")}
          className="accent-blue-600"
        />
        <span className="text-sm font-medium text-gray-700">Manually Set Scale</span>
      </label>

      {mode === "manual" && (
        <div className="ml-5 mb-3 space-y-2">
          {pixelLength === null ? (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 p-2 rounded-lg">
              Click two points on a known-length line below. Hold Shift to snap to 0°/45°/90°.
            </p>
          ) : (
            <>
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 p-2 rounded-lg">
                Line: <strong>{Math.round(pixelLength)} px</strong> — enter its real-world length
              </p>
              {isMetric ? (
                <div>
                  <label htmlFor="dsp-meters" className="block text-xs text-gray-700 mb-0.5">
                    Meters
                  </label>
                  <input
                    id="dsp-meters"
                    type="number"
                    min="0"
                    step="0.01"
                    value={meters}
                    onChange={(e) => setMeters(e.target.value)}
                    placeholder="e.g. 5.0"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label htmlFor="dsp-feet" className="block text-xs text-gray-700 mb-0.5">Feet</label>
                    <input
                      id="dsp-feet"
                      type="number"
                      min="0"
                      step="1"
                      value={feet}
                      onChange={(e) => setFeet(e.target.value)}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="dsp-inches" className="block text-xs text-gray-700 mb-0.5">Inches</label>
                    <input
                      id="dsp-inches"
                      type="number"
                      min="0"
                      max="11.99"
                      step="0.01"
                      value={inches}
                      onChange={(e) => setInches(e.target.value)}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleApply}
          disabled={!canApply}
          className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded-lg text-sm transition disabled:opacity-40"
        >
          Apply for this drawing
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
