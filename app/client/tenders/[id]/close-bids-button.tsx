'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  tenderId: number;
  submittedBidCount: number;
}

export default function CloseBidsButton({ tenderId, submittedBidCount }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClose() {
    if (
      !confirm(
        'Close bidding and start evaluation?\n\nContractors will no longer be able to edit their bids. This cannot be undone.'
      )
    )
      return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/close-bids`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Failed to close bids.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {submittedBidCount === 0 ? (
        <button
          disabled
          title="No bids have been submitted — nothing to evaluate"
          className="rounded-lg bg-amber-100 px-5 py-2 text-sm font-semibold text-amber-500 cursor-not-allowed"
        >
          Close bids &amp; start evaluation
        </button>
      ) : (
        <button
          onClick={handleClose}
          disabled={loading}
          className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Closing…' : 'Close bids & start evaluation'}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
