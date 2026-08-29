'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface BidOption {
  id: number;
  status: string;
  bidder_name: string;
  grand_total_npr: number | null;
  total_with_vat_npr: number | null;
  system_score: number | null;
  outlier_flagged: boolean;
}

interface Props {
  tenderId: number;
  isAwarded: boolean;
  bids: BidOption[];
}

function fmtNPR(v: number | null): string {
  if (v === null) return '—';
  return `NPR ${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const STATUS_COLOURS: Record<string, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-700',
  SHORTLISTED: 'bg-yellow-100 text-yellow-800',
  AWARDED: 'bg-green-100 text-green-700',
};

export default function AwardPanel({ tenderId, isAwarded, bids }: Props) {
  const router = useRouter();
  const [selectedBidId, setSelectedBidId] = useState<number | null>(
    bids.length === 1 ? bids[0].id : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaLoading, setLoaLoading] = useState(false);
  const [loaError, setLoaError] = useState<string | null>(null);

  const selectedBid = bids.find((b) => b.id === selectedBidId) ?? null;

  async function handleAward() {
    if (!selectedBidId) return;
    if (!confirm(`Award this tender to ${selectedBid?.bidder_name}?\n\nThis will mark all other bids as "Not awarded". This cannot be undone.`)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bids/${selectedBidId}/award`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push('/login'); return; }
        setError(data.error?.message ?? 'Award failed.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function downloadLoa() {
    setLoaLoading(true);
    setLoaError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/loa`);
      if (!res.ok) {
        const data = await res.json();
        setLoaError(data.error?.message ?? 'Failed to generate LOA.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LOA-${tenderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setLoaError('Network error. Please try again.');
    } finally {
      setLoaLoading(false);
    }
  }

  if (isAwarded) {
    return (
      <div>
        {loaError && <p className="mb-2 text-xs text-red-600">{loaError}</p>}
        <button
          onClick={downloadLoa}
          disabled={loaLoading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loaLoading ? 'Generating PDF…' : 'Download LOA (PDF)'}
        </button>
        <p className="mt-2 text-xs text-gray-400">The PDF will be downloaded directly to your device.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-sm font-semibold text-gray-700">Select the winning bid</p>
          <p className="text-xs text-gray-400 mt-0.5">Shortlisted bids are shown first. All other submitted/shortlisted bids will be marked "Not awarded".</p>
        </div>
        <table className="min-w-full text-sm divide-y divide-gray-100">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium w-10"></th>
              <th className="px-4 py-2 text-left font-medium">Bidder</th>
              <th className="px-4 py-2 text-right font-medium">Total (incl. VAT)</th>
              <th className="px-4 py-2 text-center font-medium">Score</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bids.map((bid) => {
              const amount = bid.total_with_vat_npr ?? bid.grand_total_npr;
              const isSelected = bid.id === selectedBidId;
              return (
                <tr
                  key={bid.id}
                  onClick={() => setSelectedBidId(bid.id)}
                  className={`cursor-pointer hover:bg-blue-50/50 ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-3 text-center">
                    <input
                      type="radio"
                      name="bid"
                      checked={isSelected}
                      onChange={() => setSelectedBidId(bid.id)}
                      className="h-4 w-4 text-blue-600"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{bid.bidder_name}</div>
                    {bid.outlier_flagged && (
                      <span className="text-xs text-amber-600">⚠ Outlier</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 tabular-nums">{fmtNPR(amount)}</td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {bid.system_score !== null ? (
                      <span className="font-medium text-gray-800">{bid.system_score.toFixed(1)}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[bid.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {bid.status === 'SHORTLISTED' ? 'Shortlisted' : 'Submitted'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedBid && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
          <p className="text-sm font-semibold text-blue-800">Ready to award to: {selectedBid.bidder_name}</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Amount: {fmtNPR(selectedBid.total_with_vat_npr ?? selectedBid.grand_total_npr)}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleAward}
        disabled={!selectedBidId || loading}
        className="rounded-lg bg-green-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Awarding…' : 'Award contract'}
      </button>
    </div>
  );
}
