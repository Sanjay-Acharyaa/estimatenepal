"use client";

import { useEffect, useState } from "react";

type Quote = {
  id: string;
  vendor: string;
  amount: number;
  discipline: string | null;
  notes: string | null;
  status: "RECEIVED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED";
  validUntil: string | null;
};

type Props = { projectId: string; estimateTotal?: number; userRole: string };

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  UNDER_REVIEW: "Under Review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};
const STATUS_COLORS: Record<string, string> = {
  RECEIVED: "bg-gray-100 text-gray-600",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-700",
  ACCEPTED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-600",
};

const NRS = (n: number) => n.toLocaleString("en-NP", { minimumFractionDigits: 2 });
const inputCls = "w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";

export function ProposalTab({ projectId, userRole }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [estimateTotal, setEstimateTotal] = useState(0);
  const [showAddQuote, setShowAddQuote] = useState(false);
  const [form, setForm] = useState({ vendor: "", amount: "", discipline: "", notes: "", status: "RECEIVED", validUntil: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const canEdit = ["OWNER", "ADMIN"].includes(userRole);

  async function loadQuotes() {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/quotes?limit=50`);
    if (res.ok) { const d = await res.json(); setQuotes(d.data); }
    setLoading(false);
  }

  useEffect(() => {
    loadQuotes();
    // Fetch actual BOQ total (not the manual estimatedValue field)
    fetch(`/api/projects/${projectId}/boq`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.finalPayable) setEstimateTotal(d.finalPayable); })
      .catch(() => {});
  }, [projectId]); // eslint-disable-line

  async function handleDownload(type: string) {
    setDownloading(type);
    const urls: Record<string, string> = {
      pdf: `/api/projects/${projectId}/boq/export/pdf`,
      excel: `/api/projects/${projectId}/boq/export/excel`,
      mb: `/api/projects/${projectId}/boq/export/mb`,
      tender: `/api/projects/${projectId}/boq/export/tender`,
      procurement: `/api/projects/${projectId}/boq/export/procurement`,
    };
    try {
      const res = await fetch(urls[type]);
      if (!res.ok) { alert("Export failed. Please try again."); setDownloading(null); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1]
        ?? `export.${["excel","mb","procurement"].includes(type) ? "xlsx" : "pdf"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Download failed."); }
    setDownloading(null);
  }

  async function handleSaveQuote(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFormError("");
    const payload = {
      vendor: form.vendor,
      amount: parseFloat(form.amount),
      discipline: form.discipline || undefined,
      notes: form.notes || undefined,
      status: form.status,
      validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
    };
    const url = editId ? `/api/projects/${projectId}/quotes/${editId}` : `/api/projects/${projectId}/quotes`;
    const method = editId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setFormError(d?.error?.message ?? "Failed."); return; }
    setShowAddQuote(false); setEditId(null);
    setForm({ vendor: "", amount: "", discipline: "", notes: "", status: "RECEIVED", validUntil: "" });
    loadQuotes();
  }

  async function handleDeleteQuote(id: string, vendor: string) {
    if (!confirm(`Delete quote from "${vendor}"?`)) return;
    await fetch(`/api/projects/${projectId}/quotes/${id}`, { method: "DELETE" });
    loadQuotes();
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/projects/${projectId}/quotes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadQuotes();
  }

  const acceptedQuote = quotes.find(q => q.status === "ACCEPTED");

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">

      {/* Export Documents */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-4">Export Documents</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { key: "tender", icon: "📋", label: "Tender Bundle", sub: "Cover + Scope + BOQ + Rates", accent: "border-indigo-200 hover:border-indigo-400" },
            { key: "pdf", icon: "📄", label: "BOQ PDF", sub: "Nepal standard format", accent: "border-blue-200 hover:border-blue-400" },
            { key: "excel", icon: "📊", label: "BOQ Excel", sub: "Summary + discipline sheets", accent: "border-green-200 hover:border-green-400" },
            { key: "mb", icon: "📏", label: "Measurement Book", sub: "MB with site details", accent: "border-yellow-200 hover:border-yellow-400" },
            { key: "procurement", icon: "🛒", label: "Procurement List", sub: "Material order quantities", accent: "border-orange-200 hover:border-orange-400" },
          ].map(exp => (
            <button key={exp.key} onClick={() => handleDownload(exp.key)}
              disabled={downloading === exp.key}
              className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl bg-white text-center transition disabled:opacity-50 ${exp.accent}`}>
              <span className="text-3xl">{exp.icon}</span>
              <div>
                <p className="text-sm font-medium text-gray-800">{downloading === exp.key ? "Generating…" : exp.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{exp.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Quote Comparison */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Quote Comparison</h2>
            <p className="text-xs text-gray-500 mt-0.5">Compare subcontractor quotes against your estimate</p>
          </div>
          {canEdit && (
            <button onClick={() => { setShowAddQuote(true); setEditId(null); setForm({ vendor: "", amount: "", discipline: "", notes: "", status: "RECEIVED", validUntil: "" }); setFormError(""); }}
              className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700">
              + Add Quote
            </button>
          )}
        </div>

        {estimateTotal > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs text-blue-600 font-medium mb-1">Your Estimate</p>
              <p className="text-xl font-bold text-blue-700">NRS {NRS(estimateTotal)}</p>
            </div>
            <div className={`rounded-lg p-4 border ${acceptedQuote ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
              <p className={`text-xs font-medium mb-1 ${acceptedQuote ? "text-green-600" : "text-gray-400"}`}>Accepted Quote</p>
              <p className={`text-xl font-bold ${acceptedQuote ? "text-green-700" : "text-gray-300"}`}>
                {acceptedQuote ? `NRS ${NRS(acceptedQuote.amount)}` : "—"}
              </p>
            </div>
            <div className={`rounded-lg p-4 border ${acceptedQuote ? (acceptedQuote.amount <= estimateTotal ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200") : "bg-gray-50 border-gray-200"}`}>
              <p className="text-xs text-gray-500 font-medium mb-1">Difference</p>
              {acceptedQuote ? (
                <p className={`text-xl font-bold ${acceptedQuote.amount <= estimateTotal ? "text-green-700" : "text-red-600"}`}>
                  {acceptedQuote.amount <= estimateTotal ? "▼" : "▲"} {Math.abs(((acceptedQuote.amount - estimateTotal) / estimateTotal) * 100).toFixed(1)}%
                </p>
              ) : <p className="text-xl font-bold text-gray-300">—</p>}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-8 text-sm">Loading…</div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-400 text-sm">No quotes yet.</p>
            {canEdit && <p className="text-gray-400 text-xs mt-1">Add subcontractor quotes to compare against your estimate.</p>}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Vendor</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Discipline</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Amount (NRS)</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">vs Estimate</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Valid Until</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                  {canEdit && <th className="px-4 py-3 w-20"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotes.map(q => {
                  const diff = estimateTotal > 0 ? ((q.amount - estimateTotal) / estimateTotal) * 100 : null;
                  const isExpired = q.validUntil && new Date(q.validUntil) < new Date();
                  return (
                    <tr key={q.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{q.vendor}</div>
                        {q.notes && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{q.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{q.discipline ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">{NRS(q.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        {diff !== null ? (
                          <span className={`text-sm font-medium ${diff <= 0 ? "text-green-600" : "text-red-500"}`}>
                            {diff <= 0 ? "▼" : "▲"} {Math.abs(diff).toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {q.validUntil ? (
                          <span className={`text-xs ${isExpired ? "text-red-500 font-medium" : "text-gray-500"}`}>
                            {isExpired ? "Expired — " : ""}{new Date(q.validUntil).toLocaleDateString()}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <select value={q.status} onChange={e => handleStatusChange(q.id, e.target.value)}
                            className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${STATUS_COLORS[q.status]}`}>
                            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        ) : (
                          <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[q.status]}`}>{STATUS_LABELS[q.status]}</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => {
                              setEditId(q.id);
                              setForm({ vendor: q.vendor, amount: String(q.amount), discipline: q.discipline ?? "", notes: q.notes ?? "", status: q.status, validUntil: q.validUntil ? q.validUntil.slice(0, 10) : "" });
                              setShowAddQuote(true); setFormError("");
                            }} className="text-xs text-blue-600 hover:underline">Edit</button>
                            <button onClick={() => handleDeleteQuote(q.id, q.vendor)} className="text-xs text-red-500 hover:underline">Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add/Edit Quote Modal */}
      {showAddQuote && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-800 mb-4">{editId ? "Edit Quote" : "Add Quote"}</h3>
            <form onSubmit={handleSaveQuote} className="space-y-3">
              {formError && <p className="text-red-600 text-sm">{formError}</p>}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Vendor / Contractor Name</label>
                <input required value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Amount (NRS)</label>
                  <input required type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none">
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Discipline (optional)</label>
                  <input value={form.discipline} onChange={e => setForm(f => ({ ...f, discipline: e.target.value }))} placeholder="e.g. Structural" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Valid Until (optional)</label>
                  <input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving…" : editId ? "Update Quote" : "Add Quote"}
                </button>
                <button type="button" onClick={() => { setShowAddQuote(false); setEditId(null); }}
                  className="px-4 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
