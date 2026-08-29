"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { VerificationDoc } from "./page";

const DOC_TYPE_LABELS: Record<string, string> = {
  COMPANY_REGISTRATION: "Company Registration",
  PAN: "PAN Certificate",
  CONTRACTOR_LICENSE: "Contractor License",
  LAND_OWNERSHIP: "Land Ownership",
  OTHER: "Other",
};

function statusBadge(status: string) {
  if (status === "PENDING") return "bg-amber-100 text-amber-700";
  if (status === "APPROVED") return "bg-green-100 text-green-700";
  if (status === "REJECTED") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

interface DocRow extends VerificationDoc {
  rejectOpen?: boolean;
  rejectReason?: string;
  actionError?: string;
  loading?: boolean;
}

type BulkResult = {
  approved?: number[];
  rejected?: number[];
  errors: { doc_id: number; message: string }[];
} | null;

export default function VerificationQueuePanel({
  initialDocs,
  pagination,
  currentPage,
}: {
  initialDocs: VerificationDoc[];
  pagination: { page: number; limit: number; total: number; pages: number };
  currentPage: number;
}) {
  const [docs, setDocs] = useState<DocRow[]>(initialDocs);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult>(null);

  useEffect(() => {
    if (!bulkResult) return;
    const t = setTimeout(() => setBulkResult(null), 4000);
    return () => clearTimeout(t);
  }, [bulkResult]);

  function updateDoc(id: number, patch: Partial<DocRow>) {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === docs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(docs.map((d) => d.id)));
  }

  async function handleApprove(id: number) {
    updateDoc(id, { loading: true, actionError: undefined });
    try {
      const res = await fetch(`/api/admin/verification-queue/${id}/approve`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        updateDoc(id, { loading: false, actionError: data?.error?.message ?? "Approval failed." });
        return;
      }
      setDocs((prev) => prev.filter((d) => d.id !== id));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    } catch {
      updateDoc(id, { loading: false, actionError: "Network error. Please retry." });
    }
  }

  async function handleReject(id: number, reason: string) {
    if (reason.trim().length < 5) {
      updateDoc(id, { actionError: "Rejection reason must be at least 5 characters." });
      return;
    }
    updateDoc(id, { loading: true, actionError: undefined });
    try {
      const res = await fetch(`/api/admin/verification-queue/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        updateDoc(id, { loading: false, actionError: data?.error?.message ?? "Rejection failed." });
        return;
      }
      setDocs((prev) => prev.filter((d) => d.id !== id));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    } catch {
      updateDoc(id, { loading: false, actionError: "Network error. Please retry." });
    }
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/admin/verification-queue/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_ids: Array.from(selectedIds) }),
      });
      const data = (await res.json()) as { approved: number[]; errors: { doc_id: number; message: string }[] };
      const approvedSet = new Set(data.approved ?? []);
      setDocs((prev) => prev.filter((d) => !approvedSet.has(d.id)));
      setSelectedIds(new Set());
      setBulkResult({ approved: data.approved, errors: data.errors });
    } catch {
      setBulkResult({ errors: [{ doc_id: 0, message: "Network error. Please retry." }] });
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkReject() {
    if (selectedIds.size === 0 || bulkReason.trim().length < 5) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/admin/verification-queue/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_ids: Array.from(selectedIds), reason: bulkReason.trim() }),
      });
      const data = (await res.json()) as { rejected: number[]; errors: { doc_id: number; message: string }[] };
      const rejectedSet = new Set(data.rejected ?? []);
      setDocs((prev) => prev.filter((d) => !rejectedSet.has(d.id)));
      setSelectedIds(new Set());
      setBulkReason("");
      setBulkRejectOpen(false);
      setBulkResult({ rejected: data.rejected, errors: data.errors });
    } catch {
      setBulkResult({ errors: [{ doc_id: 0, message: "Network error. Please retry." }] });
    } finally {
      setBulkLoading(false);
    }
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-gray-500">No pending verification documents.</p>
      </div>
    );
  }

  const allSelected = selectedIds.size === docs.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="space-y-4">
      {/* Bulk toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-3">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          Select all
        </label>
        {someSelected && (
          <>
            <button onClick={handleBulkApprove} disabled={bulkLoading}
              className="rounded px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
              {bulkLoading ? "Processing…" : `Bulk Approve (${selectedIds.size})`}
            </button>
            <button onClick={() => setBulkRejectOpen((v) => !v)} disabled={bulkLoading}
              className="rounded px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50">
              {bulkRejectOpen ? "Cancel" : `Bulk Reject (${selectedIds.size})`}
            </button>
          </>
        )}
      </div>

      {bulkRejectOpen && someSelected && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 space-y-2">
          <label className="block text-xs font-medium text-red-700">
            Rejection reason for {selectedIds.size} document(s)
          </label>
          <textarea rows={3} placeholder="Reason (min 5 characters)…"
            value={bulkReason} onChange={(e) => setBulkReason(e.target.value)}
            className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
          <button onClick={handleBulkReject} disabled={bulkLoading || bulkReason.trim().length < 5}
            className="rounded px-4 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
            {bulkLoading ? "Rejecting…" : "Confirm Bulk Reject"}
          </button>
        </div>
      )}

      {bulkResult && (
        <div className={`rounded-md border px-4 py-3 text-sm ${bulkResult.errors.length > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-green-200 bg-green-50 text-green-800"}`}>
          {(bulkResult.approved?.length ?? 0) > 0 && <span>{bulkResult.approved!.length} document(s) approved. </span>}
          {(bulkResult.rejected?.length ?? 0) > 0 && <span>{bulkResult.rejected!.length} document(s) rejected. </span>}
          {bulkResult.errors.length > 0 && <span>{bulkResult.errors.length} error(s): {bulkResult.errors.map((e) => e.message).join(", ")}</span>}
        </div>
      )}

      {docs.map((doc) => (
        <div key={doc.id} className="rounded-md border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <input type="checkbox" checked={selectedIds.has(doc.id)} onChange={() => toggleSelect(doc.id)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 flex-shrink-0" />
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">{doc.user.name}</span>
                  <span className="text-xs text-gray-400">{doc.user.email}</span>
                  <span className="rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">{doc.user.role}</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-gray-700">{DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}</span>
                  {doc.org && (
                    <span className="text-xs text-gray-500">Org: <span className="font-medium">{doc.org.name}</span></span>
                  )}
                  <span className="text-xs text-gray-400">
                    Uploaded {new Date(doc.createdAt).toLocaleDateString("en-NP", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {doc.fileUrl ? (
                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                  className="rounded px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50">
                  Download
                </a>
              ) : (
                <span className="text-xs text-gray-400">Unavailable</span>
              )}
              {!doc.rejectOpen && (
                <button onClick={() => handleApprove(doc.id)} disabled={doc.loading}
                  className="rounded px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
                  {doc.loading ? "Approving…" : "Approve"}
                </button>
              )}
              <button
                onClick={() => updateDoc(doc.id, { rejectOpen: !doc.rejectOpen, rejectReason: "", actionError: undefined })}
                disabled={doc.loading}
                className="rounded px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50">
                {doc.rejectOpen ? "Cancel" : "Reject"}
              </button>
            </div>
          </div>

          {doc.rejectOpen && (
            <div className="mt-4 space-y-2 pl-7">
              <textarea rows={3} placeholder="Rejection reason (min 5 characters)…"
                value={doc.rejectReason ?? ""}
                onChange={(e) => updateDoc(doc.id, { rejectReason: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
              <button onClick={() => handleReject(doc.id, doc.rejectReason ?? "")} disabled={doc.loading}
                className="rounded px-4 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                {doc.loading ? "Rejecting…" : "Confirm Reject"}
              </button>
            </div>
          )}
          {doc.actionError && <p className="mt-2 text-xs text-red-600 pl-7">{doc.actionError}</p>}
        </div>
      ))}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-gray-500">
            Page {pagination.page} of {pagination.pages} ({pagination.total} total)
          </span>
          <div className="flex gap-2">
            <Link href={`/admin/verification-queue?page=${currentPage - 1}`}
              className={`rounded px-3 py-1.5 text-xs font-medium border ${currentPage <= 1 ? "pointer-events-none opacity-40 border-gray-200 text-gray-400" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              Previous
            </Link>
            <Link href={`/admin/verification-queue?page=${currentPage + 1}`}
              className={`rounded px-3 py-1.5 text-xs font-medium border ${currentPage >= pagination.pages ? "pointer-events-none opacity-40 border-gray-200 text-gray-400" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              Next
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
