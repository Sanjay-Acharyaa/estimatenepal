"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

type ChangeOrder = {
  id: string; number: number; title: string;
  description: string | null; reason: string | null;
  amount: number; status: string;
  rejectionNote: string | null; approvedAt: string | null;
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-600",
};
const NRS = (n: number) => n.toLocaleString("en-NP", { minimumFractionDigits: 2 });

export default function ChangeOrdersPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", reason: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/projects/${projectId}/change-orders`);
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/change-orders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title, description: form.description || undefined, reason: form.reason || undefined, amount: parseFloat(form.amount) || 0 }),
    });
    setSaving(false);
    if (res.ok) { toast.success("Change order created."); setShowForm(false); setForm({ title: "", description: "", reason: "", amount: "" }); load(); }
    else { toast.error("Failed to create."); }
  }

  async function updateStatus(id: string, status: string, extra?: Record<string, string>) {
    setActionId(id);
    const res = await fetch(`/api/projects/${projectId}/change-orders/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    setActionId(null);
    if (res.ok) { toast.success(`Change order ${status.toLowerCase()}.`); load(); }
    else { toast.error("Action failed."); }
  }

  const approvedTotal = orders.filter(o => o.status === "APPROVED").reduce((s, o) => s + o.amount, 0);
  const pendingTotal = orders.filter(o => o.status === "SUBMITTED").reduce((s, o) => s + o.amount, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Change Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage scope changes with formal approval tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/projects/${projectId}`} className="text-sm text-gray-400 hover:text-gray-600">← Back</Link>
          <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
            + New Change Order
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {orders.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">Total Orders</p>
            <p className="text-2xl font-bold text-gray-800 mt-0.5">{orders.length}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-green-600">Approved Value</p>
            <p className="text-2xl font-bold text-green-700 mt-0.5">NRS {NRS(approvedTotal)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs text-blue-600">Pending Approval</p>
            <p className="text-2xl font-bold text-blue-700 mt-0.5">NRS {NRS(pendingTotal)}</p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? <p className="text-center text-gray-400 py-8">Loading…</p> : (
        orders.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
            <p className="text-gray-400">No change orders yet.</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-blue-600 text-sm hover:underline">Create the first one</button>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(co => (
              <div key={co.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-mono text-gray-400">CO-{String(co.number).padStart(3, "0")}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[co.status]}`}>{co.status}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-800">{co.title}</h3>
                    {co.description && <p className="text-xs text-gray-500 mt-1">{co.description}</p>}
                    {co.reason && <p className="text-xs text-gray-400 mt-1 italic">Reason: {co.reason}</p>}
                    {co.rejectionNote && <p className="text-xs text-red-500 mt-1">Rejection note: {co.rejectionNote}</p>}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-lg font-bold text-gray-800">NRS {NRS(co.amount)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(co.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {co.status === "DRAFT" && (
                    <button onClick={() => updateStatus(co.id, "SUBMITTED")} disabled={actionId === co.id}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      Submit for Approval
                    </button>
                  )}
                  {co.status === "SUBMITTED" && (
                    <>
                      <button onClick={() => updateStatus(co.id, "APPROVED")} disabled={actionId === co.id}
                        className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                        ✓ Approve
                      </button>
                      <button onClick={() => setRejectingId(co.id)} disabled={actionId === co.id}
                        className="text-xs px-3 py-1.5 bg-red-100 text-red-600 border border-red-200 rounded-lg hover:bg-red-200 disabled:opacity-50">
                        ✕ Reject
                      </button>
                    </>
                  )}
                  {rejectingId === co.id && (
                    <div className="w-full flex gap-2 mt-1">
                      <input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Rejection reason…"
                        className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-400" />
                      <button onClick={async () => { await updateStatus(co.id, "REJECTED", { rejectionNote: rejectNote }); setRejectingId(null); setRejectNote(""); }}
                        className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">Confirm Reject</button>
                      <button onClick={() => setRejectingId(null)} className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* New CO Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-800 mb-4">New Change Order</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title <span className="text-red-500">*</span></label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Additional excavation work"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (NRS)</label>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason for change</label>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Creating…" : "Create Change Order"}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
