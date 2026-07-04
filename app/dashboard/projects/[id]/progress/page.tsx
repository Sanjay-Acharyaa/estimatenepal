"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { fmtNum, fmtNPR } from "@/lib/format";
import { SCurveChart } from "@/components/projects/SCurveChart";

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

type RetentionRelease = {
  id: string;
  amount: number;
  note: string | null;
  releasedAt: string;
};

type RetentionSettings = {
  retentionEnabled: boolean;
  retentionPct: number;
  releases: RetentionRelease[];
};

export default function ProgressPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [boq, setBoq] = useState<BOQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  // Retention state
  const [retention, setRetention] = useState<RetentionSettings>({ retentionEnabled: false, retentionPct: 5, releases: [] });
  const [newReleaseAmount, setNewReleaseAmount] = useState("");
  const [newReleaseNote, setNewReleaseNote] = useState("");
  const [addingRelease, setAddingRelease] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/disciplines`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/boq`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/retention`).then(r => r.ok ? r.json() : null),
    ]).then(([dData, bData, rData]) => {
      const discs: Discipline[] = Array.isArray(dData) ? dData : dData.data ?? [];
      setDisciplines(discs);
      setDrafts(Object.fromEntries(discs.map((d: Discipline) => [d.id, d.progressPct])));
      setBoq(bData.disciplines ?? []);
      if (rData) setRetention(rData);
    }).finally(() => setLoading(false));
  }, [projectId]);

  async function saveRetentionSettings(enabled: boolean, pct: number) {
    await fetch(`/api/projects/${projectId}/retention`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retentionEnabled: enabled, retentionPct: pct }),
    });
    setRetention(prev => ({ ...prev, retentionEnabled: enabled, retentionPct: pct }));
  }

  async function addRelease() {
    const amount = parseFloat(newReleaseAmount);
    if (!amount || amount <= 0) return;
    setAddingRelease(true);
    const res = await fetch(`/api/projects/${projectId}/retention`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, note: newReleaseNote || undefined }),
    });
    if (res.ok) {
      const release = await res.json();
      setRetention(prev => ({ ...prev, releases: [release, ...prev.releases] }));
      setNewReleaseAmount("");
      setNewReleaseNote("");
      toast.success("Release recorded.");
    } else { toast.error("Failed to record release."); }
    setAddingRelease(false);
  }

  async function deleteRelease(releaseId: string) {
    await fetch(`/api/projects/${projectId}/retention/${releaseId}`, { method: "DELETE" });
    setRetention(prev => ({ ...prev, releases: prev.releases.filter(r => r.id !== releaseId) }));
    toast.success("Release deleted.");
  }

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

  const NRS = (n: number) => fmtNum(n, 2);

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

      {/* S-curve / Cash Flow Chart */}
      {!loading && totalValue > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Cash Flow S-Curve</h2>
            <p className="text-xs text-gray-500 mt-0.5">Planned expenditure curve vs actual earned value</p>
          </div>
          <SCurveChart totalValue={totalValue} completedValue={completedValue} />
        </div>
      )}

      {/* Retention Money Tracking */}
      {(() => {
        const retentionHeld = retention.retentionEnabled
          ? completedValue * (retention.retentionPct / 100)
          : 0;
        const totalReleased = retention.releases.reduce((s, r) => s + r.amount, 0);
        const retentionBalance = retentionHeld - totalReleased;
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            {/* Header + toggle */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Retention Money</h2>
                <p className="text-xs text-gray-500 mt-0.5">Track % withheld from running bills and release events</p>
              </div>
              <button
                onClick={() => saveRetentionSettings(!retention.retentionEnabled, retention.retentionPct)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${retention.retentionEnabled ? "bg-blue-600" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${retention.retentionEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {retention.retentionEnabled && (
              <>
                {/* Percentage setting */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 w-40">Retention %</label>
                  <input
                    type="number" min={0} max={20} step={0.5}
                    value={retention.retentionPct}
                    onChange={e => setRetention(prev => ({ ...prev, retentionPct: parseFloat(e.target.value) || 0 }))}
                    onBlur={() => saveRetentionSettings(retention.retentionEnabled, retention.retentionPct)}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-500">of each running bill (Nepal standard: 5–10%)</span>
                </div>

                {/* Summary cards */}
                {completedValue > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-amber-700 font-medium">Total Withheld</p>
                      <p className="text-base font-bold text-amber-800 mt-1 tabular-nums">{fmtNPR(retentionHeld)}</p>
                      <p className="text-xs text-amber-600">({retention.retentionPct}% of {fmtNPR(completedValue)})</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-green-700 font-medium">Released</p>
                      <p className="text-base font-bold text-green-800 mt-1 tabular-nums">{fmtNPR(totalReleased)}</p>
                      <p className="text-xs text-green-600">{retention.releases.length} event{retention.releases.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-blue-700 font-medium">Balance Held</p>
                      <p className="text-base font-bold text-blue-800 mt-1 tabular-nums">{fmtNPR(Math.max(0, retentionBalance))}</p>
                      <p className="text-xs text-blue-600">pending release</p>
                    </div>
                  </div>
                )}

                {/* Add release */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-600 mb-3">Record a Release</p>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="number" min={0} step={1000}
                      placeholder="Amount (NPR)"
                      value={newReleaseAmount}
                      onChange={e => setNewReleaseAmount(e.target.value)}
                      className="w-40 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Note (e.g. Practical completion)"
                      value={newReleaseNote}
                      onChange={e => setNewReleaseNote(e.target.value)}
                      className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={addRelease}
                      disabled={addingRelease || !newReleaseAmount}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingRelease ? "Saving…" : "Add Release"}
                    </button>
                  </div>
                </div>

                {/* Release history */}
                {retention.releases.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">Release History</p>
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                      {retention.releases.map(r => (
                        <div key={r.id} className="flex items-center justify-between px-4 py-2.5 bg-white">
                          <div>
                            <p className="text-sm font-semibold text-green-700">{fmtNPR(r.amount)}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(r.releasedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                              {r.note ? ` — ${r.note}` : ""}
                            </p>
                          </div>
                          <button
                            onClick={() => deleteRelease(r.id)}
                            className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
