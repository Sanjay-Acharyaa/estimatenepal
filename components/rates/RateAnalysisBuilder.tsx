"use client";

import { useState, useEffect, useMemo } from "react";
import { computeCompositeRate } from "@/lib/rateAnalysis";
import { fmtNum } from "@/lib/format";
import { getWastageDefault } from "@/lib/wastageDefaults";

interface RateItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  baseRate: number;
}

interface Props {
  rate: RateItem;
  projectId: string;
  onClose: () => void;
}

const NRS = (n: number) => fmtNum(n, 2);

export function RateAnalysisBuilder({ rate, projectId, onClose }: Props) {
  const [material, setMaterial] = useState("0");
  const [skilled, setSkilled] = useState("0");
  const [semiSkilled, setSemiSkilled] = useState("0");
  const [unskilled, setUnskilled] = useState("0");
  const [equipment, setEquipment] = useState("0");
  const [overhead, setOverhead] = useState("0");
  const [profit, setProfit] = useState("0");
  const [wastage, setWastage] = useState("0");
  const [useComputed, setUseComputed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/rates/${rate.id}/analysis?projectId=${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setMaterial(String(data.materialCost));
          setSkilled(String(data.skilledLabour));
          setSemiSkilled(String(data.semiSkilledLabour));
          setUnskilled(String(data.unskilledLabour));
          setEquipment(String(data.equipmentCost));
          setOverhead(String(data.overheadPct));
          setProfit(String(data.profitPct));
          setWastage(String(data.wastagePct));
          setUseComputed(data.useComputedRate);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [rate.id, projectId]);

  const n = (v: string) => parseFloat(v) || 0;

  const breakdown = computeCompositeRate({
    materialCost: n(material),
    skilledLabour: n(skilled),
    semiSkilledLabour: n(semiSkilled),
    unskilledLabour: n(unskilled),
    equipmentCost: n(equipment),
    overheadPct: n(overhead),
    profitPct: n(profit),
    wastagePct: n(wastage),
  });

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch(`/api/rates/${rate.id}/analysis`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          materialCost: n(material),
          skilledLabour: n(skilled),
          semiSkilledLabour: n(semiSkilled),
          unskilledLabour: n(unskilled),
          equipmentCost: n(equipment),
          overheadPct: n(overhead),
          profitPct: n(profit),
          wastagePct: n(wastage),
          useComputedRate: useComputed,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message ?? "Failed to save");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const wastageSuggestion = useMemo(() => getWastageDefault(rate.description), [rate.description]);

  const field = (label: string, value: string, set: (v: string) => void, suffix = "") => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-1.5">
        {!suffix && <span className="text-xs text-gray-600">NRS</span>}
        <input type="number" min="0" step="0.01" value={value} onChange={e => set(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        {suffix && <span className="text-xs text-gray-600">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">Rate Analysis Builder</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-mono">{rate.code}</span> — {rate.description}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-600 text-xl ml-4">×</button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-600 text-sm">Loading…</div>
        ) : (
          <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
            {/* Input grid */}
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase mb-3">Costs per {rate.unit}</p>
              <div className="grid grid-cols-2 gap-3">
                {field("Material Cost", material, setMaterial)}
                {field("Equipment Cost", equipment, setEquipment)}
                {field("Skilled Labour", skilled, setSkilled)}
                {field("Semi-Skilled Labour", semiSkilled, setSemiSkilled)}
                {field("Unskilled Labour", unskilled, setUnskilled)}
                {field("Material Wastage", wastage, setWastage, "%")}
                {field("Overhead", overhead, setOverhead, "%")}
                {field("Profit", profit, setProfit, "%")}
              </div>
              {wastageSuggestion && n(wastage) === 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-500">Suggested wastage for this rate:</span>
                  <button
                    type="button"
                    onClick={() => setWastage(String(wastageSuggestion.pct))}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-300 text-amber-800 text-xs rounded-full hover:bg-amber-100 transition"
                  >
                    <span className="font-semibold">{wastageSuggestion.pct}%</span>
                    <span className="text-amber-600">— {wastageSuggestion.reason}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Live breakdown */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-1.5">
              <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Breakdown</p>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Material (+ {n(wastage)}% wastage)</span>
                <span>NRS {NRS(breakdown.materialWithWastage)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Labour (skilled + semi + unskilled)</span>
                <span>NRS {NRS(breakdown.totalLabour)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Equipment</span>
                <span>NRS {NRS(breakdown.equipmentCost)}</span>
              </div>
              <div className="flex justify-between text-xs font-medium text-gray-700 border-t border-gray-200 pt-1.5">
                <span>Sub-total</span>
                <span>NRS {NRS(breakdown.baseTotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Overhead ({n(overhead)}%)</span>
                <span>NRS {NRS(breakdown.overheadAmount)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Profit ({n(profit)}%)</span>
                <span>NRS {NRS(breakdown.profitAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-blue-700 border-t border-gray-300 pt-2">
                <span>Computed Rate</span>
                <span>NRS {NRS(breakdown.computedRate)} / {rate.unit}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Base Rate (catalog)</span>
                <span>NRS {NRS(rate.baseRate)} / {rate.unit}</span>
              </div>
            </div>

            {/* Rate toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={useComputed} onChange={e => setUseComputed(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <div>
                <span className="text-sm font-medium text-gray-800">Use computed rate in BOQ</span>
                <p className="text-xs text-gray-500">
                  When checked: BOQ uses NRS {NRS(breakdown.computedRate)} instead of NRS {NRS(rate.baseRate)}
                </p>
              </div>
            </label>

            {error && <p className="text-red-500 text-sm">{error}</p>}
            {saved && <p className="text-green-600 text-sm">Analysis saved.</p>}
          </div>
        )}

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-200">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Close
          </button>
          <button onClick={save} disabled={saving || loading}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save Analysis"}
          </button>
        </div>
      </div>
    </div>
  );
}
