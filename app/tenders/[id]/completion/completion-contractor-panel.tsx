'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CompletionRequest {
  id: number;
  attempt_number: number;
  completion_notes: string | null;
  status: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

interface Props {
  tenderId: number;
  tenderStatus: string;
  openSnagCount: number;
  hasPending: boolean;
  requests: CompletionRequest[];
}

const STATUS_COLOURS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  ESCALATED: 'bg-purple-100 text-purple-700',
};

export default function CompletionContractorPanel({ tenderId, tenderStatus, openSnagCount, hasPending, requests }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const isCompleted = tenderStatus === 'COMPLETED';
  const canSubmit = !isCompleted && !hasPending && openSnagCount === 0;

  async function submitRequest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/completion/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completion_notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'पेश गर्न सकिएन।'); return; }
      setNotes('');
      router.refresh();
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      {isCompleted && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
          <h3 className="font-semibold text-green-900 mb-2">✓ कार्य पूर्ण भयो</h3>
          <p className="text-sm text-green-800">तपाईंको काम सफलतापूर्वक स्वीकृत भएको छ।</p>
        </div>
      )}

      {!isCompleted && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="font-semibold mb-3">पूर्णता अनुरोध पेश गर्नुहोस्</h3>

          {openSnagCount > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 mb-4">
              <p className="text-sm text-amber-800">{openSnagCount} snag item(s) अझै खुला छन्। पेश गर्नु अघि सबै बन्द गर्नुहोस्।</p>
            </div>
          )}

          {hasPending && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 mb-4">
              <p className="text-sm text-blue-800">पूर्णता अनुरोध पहिले नै पेश गरिएको छ। ग्राहकको प्रतिक्रियाको प्रतीक्षा गर्नुहोस्।</p>
            </div>
          )}

          {canSubmit && (
            <>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="पूर्णता सम्बन्धी थप नोट (वैकल्पिक)…"
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none mb-3"
              />
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              <button onClick={submitRequest} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'पेश हुँदैछ…' : 'पूर्णता अनुरोध पेश गर्नुहोस्'}
              </button>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="font-semibold mb-4">अनुरोधको इतिहास</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-gray-500">कुनै अनुरोध पेश गरिएको छैन।</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="flex items-start justify-between border-b border-gray-100 pb-3 last:border-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">प्रयास #{r.attempt_number}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLOURS[r.status] ?? 'bg-gray-100 text-gray-700'}`}>{r.status}</span>
                  </div>
                  {r.completion_notes && <p className="text-xs text-gray-600">{r.completion_notes}</p>}
                  {r.rejection_reason && <p className="text-xs text-red-600 mt-1">कारण: {r.rejection_reason}</p>}
                </div>
                <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('en-GB')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
