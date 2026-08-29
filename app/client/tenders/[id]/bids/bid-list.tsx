'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface BidRow {
  id: number;
  bidder_user_id: number;
  status: string;
  submitted_at: string | null;
  version: number;
  grand_total_npr: number | null;
  system_score: number | null;
  outlier_flagged: boolean;
  bidder_name: string;
}

interface Tender {
  id: number;
  title: string;
  reference_number: string;
  status: string;
}

interface BidListProps {
  tenderId: number;
  tender: Tender;
  initialBids: BidRow[];
}

const STATUS_COLOURS: Record<string, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-700',
  SHORTLISTED: 'bg-yellow-100 text-yellow-800',
  AWARDED: 'bg-green-100 text-green-700',
  NOT_AWARDED: 'bg-red-100 text-red-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  SHORTLISTED: 'Shortlisted',
  AWARDED: 'Awarded',
  NOT_AWARDED: 'Not awarded',
  REJECTED: 'Rejected',
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtNPR(v: number | null): string {
  if (v === null) return '—';
  return `NPR ${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function BidList({ tenderId, tender, initialBids }: BidListProps) {
  const router = useRouter();
  const [bids, setBids] = useState<BidRow[]>(initialBids);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function handleAction(bidId: number, action: 'shortlist' | 'reject') {
    setActionError(null);
    setBusy(bidId);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bids/${bidId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push('/login'); return; }
        setActionError(data.error?.message ?? `${action} failed.`);
        return;
      }
      const newStatus = action === 'shortlist' ? 'SHORTLISTED' : 'REJECTED';
      setBids((prev) => prev.map((b) => (b.id === bidId ? { ...b, status: newStatus } : b)));
    } catch {
      setActionError('Network error. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const submittedCount = bids.filter((b) => b.status === 'SUBMITTED').length;
  const shortlistedCount = bids.filter((b) => b.status === 'SHORTLISTED').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Link href={`/client/tenders/${tenderId}`} className="text-sm text-gray-400 hover:text-gray-600">
                ← {tender.reference_number}
              </Link>
            </div>
            <h1 className="text-sm font-semibold text-gray-900 truncate">{tender.title} — Bids</h1>
          </div>
          <div className="flex items-center gap-4 shrink-0 text-sm text-gray-500">
            <span>{bids.length} bid{bids.length !== 1 ? 's' : ''}</span>
            {submittedCount > 0 && <span className="text-blue-600">{submittedCount} awaiting review</span>}
            {shortlistedCount > 0 && <span className="text-yellow-700">{shortlistedCount} shortlisted</span>}
            <Link href={`/client/tenders/${tenderId}/score`} className="text-blue-600 hover:text-blue-800 underline">
              Score
            </Link>
            <Link href={`/client/tenders/${tenderId}/award`} className="text-green-700 hover:text-green-900 underline">
              Award
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {actionError && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</div>
        )}

        {bids.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="text-sm text-gray-500">No bids submitted yet.</p>
            <p className="mt-1 text-xs text-gray-400">Bids appear here once contractors submit them before the deadline.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Bidder</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Total (incl. VAT)</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Submitted</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Score</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bids.map((bid) => {
                  const colour = STATUS_COLOURS[bid.status] ?? 'bg-gray-100 text-gray-700';
                  const label = STATUS_LABELS[bid.status] ?? bid.status;
                  const isbusy = busy === bid.id;
                  const canShortlist = bid.status === 'SUBMITTED';
                  const canReject = bid.status === 'SUBMITTED' || bid.status === 'SHORTLISTED';

                  return (
                    <tr key={bid.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{bid.bidder_name}</div>
                        {bid.outlier_flagged && (
                          <span title="Price flagged as statistical outlier" className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600">
                            ⚠ Outlier
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 font-medium">
                        {fmtNPR(bid.grand_total_npr)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(bid.submitted_at)}</td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        {bid.system_score !== null ? (
                          <span className="font-medium text-gray-800">{bid.system_score.toFixed(1)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colour}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canShortlist && (
                            <button
                              onClick={() => handleAction(bid.id, 'shortlist')}
                              disabled={isbusy}
                              className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-800 hover:bg-yellow-100 disabled:opacity-50"
                            >
                              {isbusy ? '…' : 'Shortlist'}
                            </button>
                          )}
                          {canReject && (
                            <button
                              onClick={() => handleAction(bid.id, 'reject')}
                              disabled={isbusy}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              {isbusy ? '…' : 'Reject'}
                            </button>
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
    </div>
  );
}
