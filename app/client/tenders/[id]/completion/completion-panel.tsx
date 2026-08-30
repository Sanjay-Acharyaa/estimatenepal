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
  requests: CompletionRequest[];
  tenderStatus: string;
}

const STATUS_COLOURS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  ESCALATED: 'bg-purple-100 text-purple-700',
};

export default function CompletionPanel({ tenderId, requests, tenderStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const pendingRequest = requests.find((r) => r.status === 'PENDING');
  const isCompleted = tenderStatus === 'COMPLETED';

  async function approve() {
    if (!confirm('कार्य पूर्णता स्वीकृत गर्ने? DLP अवधि सुरु हुनेछ।')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/completion/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'स्वीकृत गर्न सकिएन।'); return; }
      router.refresh();
    } finally { setLoading(false); }
  }

  async function reject() {
    if (!rejectReason.trim()) { setError('अस्वीकृति कारण आवश्यक छ।'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/completion/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'अस्वीकार गर्न सकिएन।'); return; }
      setRejectReason('');
      setShowReject(false);
      router.refresh();
    } finally { setLoading(false); }
  }

  async function downloadCert() {
    const res = await fetch(`/api/tenders/${tenderId}/completion/certificate`);
    const data = await res.json();
    if (!res.ok) { alert(data.error?.message ?? 'Failed to generate certificate.'); return; }
    window.open(data.url, '_blank');
  }

  return (
    <div className="space-y-6">
      {isCompleted && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
          <h3 className="font-semibold text-green-900 mb-2">✓ कार्य पूर्ण भयो</h3>
          <p className="text-sm text-green-800 mb-4">यो परियोजना सफलतापूर्वक पूर्ण भएको छ।</p>
          <button onClick={downloadCert} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            पूर्णता प्रमाणपत्र डाउनलोड गर्नुहोस्
          </button>
        </div>
      )}

      {pendingRequest && !isCompleted && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h3 className="font-semibold text-amber-900 mb-3">पूर्णता अनुरोध #{pendingRequest.attempt_number}</h3>
          {pendingRequest.completion_notes && (
            <p className="text-sm text-amber-800 mb-4">ठेकेदारको नोट: {pendingRequest.completion_notes}</p>
          )}
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={approve} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {loading ? '…' : 'स्वीकृत गर्नुहोस्'}
            </button>
            <button onClick={() => setShowReject(!showReject)} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">
              अस्वीकार गर्नुहोस्
            </button>
          </div>
          {showReject && (
            <div className="mt-4 space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="अस्वीकृतिको कारण…"
                rows={3}
                className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm resize-none"
              />
              <button onClick={reject} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {loading ? 'पठाउँदैछ…' : 'अस्वीकार पुष्टि गर्नुहोस्'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="font-semibold mb-4">अनुरोधको इतिहास</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-gray-500">कुनै अनुरोध छैन।</p>
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
