"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useParams } from "next/navigation";

type Discipline = {
  id: string;
  name: string;
  progressPct: number;
  isPrimary: boolean;
};

type BOQItem = {
  disciplineId: string;
  disciplineName: string;
  total: number;
};

export default function ProgressPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [boq, setBoq] = useState<BOQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/disciplines`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/boq`).then(r => r.json()),
    ]).then(([dData, bData]) => {
      const discs: Discipline[] = Array.isArray(dData) ? dData : dData.data ?? [];
      setDisciplines(discs);
      setDrafts(Object.fromEntries(discs.map((d: Discipline) => [d.id, d.progressPct])));
      setBoq(bData.disciplines ?? []);
    }).finally(() => setLoading(false));
  }, [projectId]);

  async function saveProgress(dId: string) {
    setSaving(dId);
    const res = await fetch(`/api/projects/${projectId}/disciplines/${dId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progressPct: drafts[dId] }),
    });
    setSaving(null);
    if (res.ok) {
      setDisciplines(prev => prev.map(d => d.id === dId ? { ...d, progressPct: drafts[dId] } : d));
      toast.success("Progress updated.");
    } else { toast.error("Failed to save."); }
  }

  const totalValue = boq.reduce((s, b) => s + b.total, 0);
  const completedValue = boq.reduce((s, b) => {
    const pct = (drafts[b.disciplineId] ?? 0) / 100;
    return s + b.total * pct;
  }, 0);
  const overallPct = totalValue > 0 ? (completedValue / totalValue) * 100 : 0;

  const NRS = (n: number) => n.toLocaleString("en-NP", { minimumFractionDigits: 2 });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Progress Billing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track completion % per discipline to generate running account bills</p>
        </div>
        <Link href={`/dashboard/projects/${projectId}`} className="text-sm text-gray-600 hover:text-gray-600">← Back</Link>
      </div>

      {/* Overall progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-600">Overall Completion</p>
            <p className="text-3xl font-bold text-blue-600 mt-0.5">{overallPct.toFixed(1)}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-600">Completed Value</p>
            <p className="text-lg font-semibold text-green-600">NRS {NRS(completedValue)}</p>
            <p className="text-xs text-gray-600 mt-0.5">of NRS {NRS(totalValue)}</p>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div className="bg-blue-500 h-3 rounded-full transition-all duration-500" style={{ width: `${overallPct}%` }} />
        </div>
      </div>

      {/* Per-discipline */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="px-5 py-3 bg-gray-50 rounded-t-xl">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Discipline Breakdown</p>
        </div>
        {loading && (
          <div className="p-6 text-center text-gray-600 text-sm">Loading…</div>
        )}
        {!loading && disciplines.map(d => {
          const boqItem = boq.find(b => b.disciplineId === d.id);
          const pct = drafts[d.id] ?? 0;
          const earned = boqItem ? boqItem.total * (pct / 100) : null;
          const changed = pct !== d.progressPct;
          return (
            <div key={d.id} className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-800">{d.name}</span>
                <div className="flex items-center gap-3">
                  {earned !== null && (
                    <span className="text-xs text-green-600 font-medium">NRS {NRS(earned)}</span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range" min={0} max={100} step={5}
                      value={pct}
                      onChange={e => setDrafts(prev => ({ ...prev, [d.id]: Number(e.target.value) }))}
                      className="w-32 accent-blue-500"
                    />
                    <span className="text-sm font-mono font-semibold text-gray-700 w-10 text-right">{pct}%</span>
                  </div>
                  <button onClick={() => saveProgress(d.id)} disabled={!changed || saving === d.id}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${changed ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-600"} disabled:opacity-50`}>
                    {saving === d.id ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className="bg-blue-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              {boqItem && (
                <p className="text-xs text-gray-600 mt-1">BOQ Value: NRS {NRS(boqItem.total)}</p>
              )}
            </div>
          );
        })}
        {!loading && disciplines.length === 0 && (
          <p className="p-6 text-center text-gray-600 text-sm">No disciplines found. Add disciplines in the Takeoff tab first.</p>
        )}
      </div>

      {/* Running account summary */}
      {completedValue > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-green-800 mb-3">Running Account Bill Summary</h2>
          <div className="space-y-1.5">
            {disciplines.filter(d => (drafts[d.id] ?? 0) > 0).map(d => {
              const boqItem = boq.find(b => b.disciplineId === d.id);
              if (!boqItem) return null;
              const earned = boqItem.total * ((drafts[d.id] ?? 0) / 100);
              return (
                <div key={d.id} className="flex justify-between text-sm">
                  <span className="text-green-700">{d.name} ({drafts[d.id]}%)</span>
                  <span className="font-medium text-green-800">NRS {NRS(earned)}</span>
                </div>
              );
            })}
            <div className="border-t border-green-300 pt-2 mt-2 flex justify-between font-bold text-green-900">
              <span>Total Earned</span>
              <span>NRS {NRS(completedValue)}</span>
            </div>
            <div className="flex justify-between text-sm text-green-600">
              <span>Remaining</span>
              <span>NRS {NRS(totalValue - completedValue)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
