"use client";

import { useMemo, useState } from "react";
import { fmtNPR, fmtNPRCompact } from "@/lib/format";

interface SCurveChartProps {
  totalValue: number;
  completedValue: number;
}

const SVG_W = 700;
const SVG_H = 280;
const PAD = { left: 80, right: 24, top: 24, bottom: 56 };
const CW = SVG_W - PAD.left - PAD.right;
const CH = SVG_H - PAD.top - PAD.bottom;
const N = 100; // curve resolution

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

// Normalized S-curve: t ∈ [0,1] → [0,1], k controls steepness
function sCurve(t: number, k = 10): number {
  const lo = sigmoid(-k / 2);
  const hi = sigmoid(k / 2);
  return (sigmoid(k * (t - 0.5)) - lo) / (hi - lo);
}

function cx(t: number) {
  return PAD.left + t * CW;
}
function cy(v: number, total: number) {
  if (total === 0) return PAD.top + CH;
  return PAD.top + (1 - Math.min(v / total, 1)) * CH;
}
function yLabel(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(0)} L`;
  return v.toLocaleString();
}

export function SCurveChart({ totalValue, completedValue }: SCurveChartProps) {
  const today = new Date();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const months = useMemo(() => {
    if (!startDate || !endDate) return null;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return null;
    const result: string[] = [];
    const cur = new Date(s);
    while (cur <= e) {
      result.push(cur.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }));
      cur.setMonth(cur.getMonth() + 1);
    }
    return result;
  }, [startDate, endDate]);

  // current date progress on timeline (0–1)
  const timeProgress = useMemo(() => {
    if (!startDate || !endDate) return null;
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    const now = today.getTime();
    if (e <= s) return null;
    return Math.max(0, Math.min(1, (now - s) / (e - s)));
  }, [startDate, endDate]);

  // Planned curve points (t, plannedV)
  const plannedPts = useMemo(() =>
    Array.from({ length: N + 1 }, (_, i) => {
      const t = i / N;
      return { t, v: sCurve(t) * totalValue };
    }), [totalValue]);

  const planPath = plannedPts
    .map(({ t, v }, i) => `${i === 0 ? "M" : "L"}${cx(t).toFixed(1)},${cy(v, totalValue).toFixed(1)}`)
    .join(" ");

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    v: f * totalValue,
    y: cy(f * totalValue, totalValue),
    label: yLabel(f * totalValue),
  }));

  // X-axis ticks — either by months or by 0/25/50/75/100%
  const xTicks: Array<{ t: number; label: string }> =
    months && months.length <= 25
      ? months.map((m, i) => ({ t: i / (months.length - 1), label: m }))
      : [0, 0.25, 0.5, 0.75, 1].map(t => ({ t, label: `${Math.round(t * 100)}%` }));

  // Actual earned point: if dates given, place at timeProgress; else at earned fraction of S-curve
  const actualT: number = timeProgress !== null
    ? timeProgress
    : totalValue > 0 ? (() => {
      // Invert S-curve: find t such that sCurve(t)*totalValue ≈ completedValue
      let lo = 0, hi = 1;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (sCurve(mid) * totalValue < completedValue) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    })() : 0;

  const actualPt = { x: cx(actualT), y: cy(completedValue, totalValue) };
  const hasDates = !!(startDate && endDate && months);

  return (
    <div className="space-y-4">
      {/* Date inputs */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Project Start</label>
          <input
            type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Project End</label>
          <input
            type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {!hasDates && (
          <span className="text-xs text-gray-400">Enter dates to see a time-based S-curve</span>
        )}
      </div>

      {totalValue === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
          Set up BOQ with rates to see the cash flow S-curve.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full h-auto"
            aria-label="S-curve cash flow chart"
          >
            {/* Grid lines */}
            {yTicks.map(({ y, label }) => (
              <g key={label}>
                <line x1={PAD.left} y1={y} x2={PAD.left + CW} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                <text x={PAD.left - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="#6b7280">{label}</text>
              </g>
            ))}

            {/* Planned S-curve fill */}
            <path
              d={`${planPath} L${cx(1).toFixed(1)},${(PAD.top + CH).toFixed(1)} L${PAD.left},${(PAD.top + CH).toFixed(1)} Z`}
              fill="#dbeafe"
              fillOpacity="0.45"
            />

            {/* Planned S-curve line */}
            <path d={planPath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* Today's date vertical line (if dates given) */}
            {hasDates && timeProgress !== null && timeProgress > 0 && timeProgress < 1 && (
              <>
                <line
                  x1={cx(timeProgress)} y1={PAD.top}
                  x2={cx(timeProgress)} y2={PAD.top + CH}
                  stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3"
                />
                <text
                  x={cx(timeProgress)} y={PAD.top - 8}
                  textAnchor="middle" fontSize="9" fill="#d97706" fontWeight="600"
                >Today</text>
              </>
            )}

            {/* Actual earned horizontal line */}
            {completedValue > 0 && (
              <line
                x1={PAD.left} y1={cy(completedValue, totalValue)}
                x2={actualPt.x} y2={cy(completedValue, totalValue)}
                stroke="#16a34a" strokeWidth="1.5" strokeDasharray="4,3"
              />
            )}

            {/* Actual earned point */}
            {completedValue > 0 && (
              <>
                <circle cx={actualPt.x} cy={actualPt.y} r="6" fill="#16a34a" />
                <circle cx={actualPt.x} cy={actualPt.y} r="3" fill="#fff" />
                <text
                  x={actualPt.x + 8}
                  y={actualPt.y - 8}
                  fontSize="9.5" fill="#15803d" fontWeight="600"
                >
                  Actual: {fmtNPRCompact(completedValue)}
                </text>
              </>
            )}

            {/* X axis */}
            <line x1={PAD.left} y1={PAD.top + CH} x2={PAD.left + CW} y2={PAD.top + CH} stroke="#d1d5db" strokeWidth="1" />

            {/* X ticks */}
            {xTicks
              .filter((_, i, arr) => {
                if (arr.length <= 7) return true;
                // for many months, show every 3rd
                return i % Math.ceil(arr.length / 7) === 0 || i === arr.length - 1;
              })
              .map(({ t, label }) => (
                <g key={label}>
                  <line x1={cx(t)} y1={PAD.top + CH} x2={cx(t)} y2={PAD.top + CH + 4} stroke="#d1d5db" strokeWidth="1" />
                  <text
                    x={cx(t)} y={PAD.top + CH + 16}
                    textAnchor="middle" fontSize="9.5" fill="#6b7280"
                    transform={`rotate(-30, ${cx(t)}, ${PAD.top + CH + 16})`}
                  >{label}</text>
                </g>
              ))
            }

            {/* Y axis */}
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CH} stroke="#d1d5db" strokeWidth="1" />

            {/* Legend */}
            <g transform={`translate(${PAD.left + 8}, ${PAD.top + 8})`}>
              <rect x="0" y="0" width="10" height="3" rx="1.5" fill="#3b82f6" />
              <text x="14" y="4" fontSize="9.5" fill="#374151">Planned (S-curve)</text>
              {completedValue > 0 && (
                <>
                  <circle cx="5" cy="14" r="3" fill="#16a34a" />
                  <text x="14" y="18" fontSize="9.5" fill="#374151">Actual earned</text>
                </>
              )}
            </g>
          </svg>

          {/* Summary row */}
          <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
            <div className="px-4 py-3 text-center">
              <p className="text-xs text-gray-500">Total Project Value</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5 tabular-nums">{fmtNPR(totalValue)}</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-xs text-gray-500">Earned to Date</p>
              <p className="text-sm font-bold text-green-700 mt-0.5 tabular-nums">{fmtNPR(completedValue)}</p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-xs text-gray-500">Remaining</p>
              <p className="text-sm font-bold text-amber-700 mt-0.5 tabular-nums">{fmtNPR(Math.max(0, totalValue - completedValue))}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
