"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

export interface TenderRow {
  id: number;
  title: string;
  reference_number: string;
  status: string;
  tender_type: string;
  bid_deadline: string;
  district: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  UNDER_REVIEW: "Under Review",
  NEGOTIATION: "Negotiation",
  CONTRACT_DRAFT: "Contract Draft",
  CONTRACT_SIGNED: "Contract Signed",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  AWARDED: "Awarded",
  CANCELLED: "Cancelled",
};

const STATUS_COLOURS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PUBLISHED: "bg-blue-100 text-blue-700",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
  NEGOTIATION: "bg-purple-100 text-purple-700",
  CONTRACT_DRAFT: "bg-orange-100 text-orange-700",
  CONTRACT_SIGNED: "bg-teal-100 text-teal-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  COMPLETED: "bg-green-100 text-green-700",
  AWARDED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const STATUS_ORDER = [
  "DRAFT", "PUBLISHED", "UNDER_REVIEW", "NEGOTIATION",
  "CONTRACT_DRAFT", "CONTRACT_SIGNED", "IN_PROGRESS", "COMPLETED",
  "AWARDED", "CANCELLED",
];

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function TendersTable({ tenders }: { tenders: TenderRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const statusCounts = useMemo(
    () =>
      tenders.reduce<Record<string, number>>((acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
      }, {}),
    [tenders]
  );

  const activePills = STATUS_ORDER.filter((s) => (statusCounts[s] ?? 0) > 0);

  const filtered = useMemo(() => {
    let rows = statusFilter ? tenders.filter((t) => t.status === statusFilter) : tenders;
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.reference_number.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [tenders, statusFilter, query]);

  const hasQuery = query.trim().length > 0;
  const hasFilter = hasQuery || statusFilter !== null;

  function emptyMessage(): string {
    const statusLabel = statusFilter ? (STATUS_LABELS[statusFilter] ?? statusFilter) : null;
    if (statusLabel && hasQuery) return `No ${statusLabel} tenders match "${query.trim()}".`;
    if (statusLabel) return `No ${statusLabel} tenders.`;
    return `No tenders match "${query.trim()}".`;
  }

  return (
    <div>
      {activePills.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter(null)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === null ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All <span className="font-bold">{tenders.length}</span>
          </button>
          {activePills.map((s) => {
            const active = statusFilter === s;
            const base = STATUS_COLOURS[s] ?? "bg-gray-100 text-gray-700";
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(active ? null : s)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${base} ${
                  active ? "ring-2 ring-offset-1 ring-gray-900" : "hover:opacity-80"
                }`}
              >
                {STATUS_LABELS[s]} <span className="font-bold">{statusCounts[s]}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-3 flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or reference…"
          className="w-full max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
        />
        {hasFilter && (
          <span className="shrink-0 text-xs text-gray-400">
            {filtered.length} of {tenders.length}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center">
          <p className="text-sm text-gray-500">{emptyMessage()}</p>
          {hasFilter && (
            <button
              onClick={() => { setQuery(""); setStatusFilter(null); }}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ref</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">District</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Deadline</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((tender) => {
                const colour = STATUS_COLOURS[tender.status] ?? "bg-gray-100 text-gray-700";
                const label = STATUS_LABELS[tender.status] ?? tender.status;
                return (
                  <tr key={tender.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                      {tender.reference_number}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                      {tender.title}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {tender.district}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {tender.tender_type === "INVITATION_ONLY" ? "Invitation" : "Public"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colour}`}>
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(tender.bid_deadline)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/client/tenders/${tender.id}`}
                          className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                        >
                          Details
                        </Link>
                        {tender.status === "PUBLISHED" && (
                          <Link
                            href={`/tenders/${tender.id}`}
                            className="text-xs font-medium text-gray-500 hover:underline whitespace-nowrap"
                          >
                            Public view
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
