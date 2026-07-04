"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { fmtNPR } from "@/lib/format";

type Payment = {
  id: string;
  email: string;
  planKey: string;
  billing: string;
  amount: number;
  txnId: string;
  orgId: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  PENDING:  "bg-amber-100 text-amber-700",
  VERIFIED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/payments")
      .then(r => r.ok ? r.json() : [])
      .then(setPayments)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: "VERIFIED" | "REJECTED", adminNote?: string) {
    setUpdating(id);
    await fetch(`/api/admin/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNote }),
    });
    setUpdating(null);
    load();
  }

  const pending  = payments.filter(p => p.status === "PENDING");
  const verified = payments.filter(p => p.status === "VERIFIED");
  const rejected = payments.filter(p => p.status === "REJECTED");

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-red-200 hover:text-white text-sm">← Admin</Link>
        <span className="font-bold text-lg">Pending Payments</span>
        <button onClick={load} className="ml-auto text-sm text-red-200 hover:text-white">Refresh</button>
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Pending Verification", value: pending.length, color: "bg-amber-50 border-amber-200" },
            { label: "Verified", value: verified.length, color: "bg-green-50 border-green-200" },
            { label: "Rejected", value: rejected.length, color: "bg-gray-50 border-gray-200" },
          ].map(s => (
            <div key={s.label} className={`${s.color} border rounded-xl p-4`}>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {loading && <p className="text-gray-500 text-sm">Loading…</p>}

        {/* Pending first */}
        {pending.length > 0 && (
          <section className="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
              <h2 className="font-semibold text-amber-800 text-sm">Action Required — {pending.length} pending</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">Plan</th>
                  <th className="text-left px-4 py-2">Billing</th>
                  <th className="text-left px-4 py-2">Amount</th>
                  <th className="text-left px-4 py-2">Txn ID</th>
                  <th className="text-left px-4 py-2">Submitted</th>
                  <th className="text-left px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map(p => (
                  <tr key={p.id} className="hover:bg-amber-50/40">
                    <td className="px-4 py-3 text-gray-800 font-medium">{p.email}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{p.planKey}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{p.billing}</td>
                    <td className="px-4 py-3 text-gray-900 font-semibold">{fmtNPR(p.amount)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.txnId}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(p.createdAt).toLocaleDateString("en-NP", { day: "2-digit", month: "short" })}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateStatus(p.id, "VERIFIED")}
                          disabled={updating === p.id}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded disabled:opacity-50"
                        >
                          {updating === p.id ? "…" : "Verify"}
                        </button>
                        <button
                          onClick={() => updateStatus(p.id, "REJECTED")}
                          disabled={updating === p.id}
                          className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* All payments */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-800 text-sm">All Payment Notifications</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Email</th>
                <th className="text-left px-4 py-2">Plan</th>
                <th className="text-left px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Txn ID</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.length === 0 && !loading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No payments yet.</td></tr>
              )}
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{p.email}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs capitalize">{p.planKey} / {p.billing}</td>
                  <td className="px-4 py-3 text-gray-900 font-semibold text-xs">{fmtNPR(p.amount)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.txnId}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(p.createdAt).toLocaleDateString("en-NP", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
