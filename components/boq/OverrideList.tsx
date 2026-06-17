"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface Override {
  id: string;
  rateItemId: string;
  field: string;
  originalValue: string;
  proposedValue: string;
  approvedValue: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedBy: string;
  reviewedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
  rateItem: { code: string; description: string; unit: string };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Props {
  projectId: string;
  isAdmin: boolean;
}

const STATUS_COLORS = {
  PENDING: "bg-orange-100 text-orange-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export function OverrideList({ projectId, isAdmin }: Props) {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter !== "all") sp.set("status", statusFilter);
      const res = await fetch(`/api/projects/${projectId}/boq/overrides?${sp}`);
      if (!res.ok) throw new Error("Failed to load overrides");
      const data = await res.json();
      setOverrides(data.data);
      setPagination(data.pagination);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, action: "approve" | "reject", approvedValue?: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/boq/overrides/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, approvedValue }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed");
      }
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 text-sm">
        {["all", "PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 rounded-full border transition-colors ${
              statusFilter === s
                ? "bg-blue-600 text-white border-blue-600"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            {s === "PENDING" && pagination && statusFilter !== "PENDING" && " "}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-600 text-sm">Loading…</div>
      )}

      {error && (
        <div className="text-red-500 text-sm py-4">{error}</div>
      )}

      {!loading && !error && overrides.length === 0 && (
        <div className="text-center py-12 text-gray-600 text-sm">
          {statusFilter === "all"
            ? "No overrides proposed yet."
            : `No ${statusFilter.toLowerCase()} overrides.`}
        </div>
      )}

      {!loading && overrides.map((ov) => (
        <div key={ov.id} className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                  {ov.rateItem.code}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ov.status]}`}>
                  {ov.status}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-800 truncate">{ov.rateItem.description}</p>
              <p className="text-xs text-gray-500 mt-0.5">Unit: {ov.rateItem.unit}</p>

              <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
                <span>
                  <span className="text-gray-600">Field: </span>
                  <span className="font-medium capitalize">{ov.field}</span>
                </span>
                <span>
                  <span className="text-gray-600">Original: </span>
                  <span>NRS {parseFloat(ov.originalValue).toLocaleString("en-NP", { minimumFractionDigits: 2 })}</span>
                </span>
                <span>
                  <span className="text-gray-600">Proposed: </span>
                  <span className="font-semibold text-blue-700">
                    NRS {parseFloat(ov.proposedValue).toLocaleString("en-NP", { minimumFractionDigits: 2 })}
                  </span>
                </span>
                {ov.approvedValue && (
                  <span>
                    <span className="text-gray-600">Approved: </span>
                    <span className="font-semibold text-green-700">
                      NRS {parseFloat(ov.approvedValue).toLocaleString("en-NP", { minimumFractionDigits: 2 })}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons — Admin/Owner only, on PENDING overrides */}
            {isAdmin && ov.status === "PENDING" && (
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => review(ov.id, "approve")}
                  disabled={acting === ov.id}
                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {acting === ov.id ? "…" : "Approve"}
                </button>
                <button
                  onClick={() => review(ov.id, "reject")}
                  disabled={acting === ov.id}
                  className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
          </div>

          <div className="mt-2 flex gap-4 text-xs text-gray-600">
            <span>Proposed: {new Date(ov.createdAt).toLocaleDateString("en-NP")}</span>
            {ov.resolvedAt && (
              <span>Resolved: {new Date(ov.resolvedAt).toLocaleDateString("en-NP")}</span>
            )}
          </div>
        </div>
      ))}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">
            {page} / {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
