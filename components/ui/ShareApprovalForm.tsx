"use client";

import { useState } from "react";

export function ShareApprovalForm({ token, clientEmail }: { token: string; clientEmail?: string | null }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [error, setError] = useState("");

  async function submit(action: "APPROVED" | "REJECTED") {
    if (!name.trim()) { setError("Please enter your name."); return; }
    setSubmitting(true); setError("");
    const res = await fetch(`/api/share/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, clientName: name.trim(), note: note.trim() || undefined }),
    });
    setSubmitting(false);
    if (res.ok) { setDone(action); }
    else { const d = await res.json(); setError(d?.error?.message ?? "Something went wrong."); }
  }

  if (done) {
    return (
      <div className={`rounded-xl border p-8 text-center ${done === "APPROVED" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
        <p className="text-3xl mb-3">{done === "APPROVED" ? "✅" : "❌"}</p>
        <p className={`text-lg font-semibold ${done === "APPROVED" ? "text-green-700" : "text-red-700"}`}>
          {done === "APPROVED" ? "Proposal Approved!" : "Proposal Rejected"}
        </p>
        <p className="text-sm text-gray-500 mt-2">
          {done === "APPROVED" ? "The project team has been notified. Thank you!" : "The project team has been notified of your decision."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-1">Your Response</h2>
      <p className="text-sm text-gray-500 mb-5">Review the proposal above and approve or reject it. The project team will be notified immediately.</p>

      {error && <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="space-y-3 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Your name <span className="text-red-500">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ram Prasad Sharma"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="Any comments or conditions…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => submit("APPROVED")} disabled={submitting}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-50">
          {submitting ? "Submitting…" : "✓ Approve Proposal"}
        </button>
        <button onClick={() => submit("REJECTED")} disabled={submitting}
          className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-3 rounded-xl text-sm transition disabled:opacity-50 border border-red-200">
          ✕ Reject
        </button>
      </div>
    </div>
  );
}
