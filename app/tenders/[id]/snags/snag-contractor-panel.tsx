'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SnagItem {
  id: number;
  item_number: number;
  description: string;
  location_reference: string | null;
  priority: string;
  status: string;
  fixed_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  addedBy: { full_name: string };
}

interface Props {
  tenderId: number;
  snags: SnagItem[];
}

const PRIORITY_COLOURS: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-green-100 text-green-700',
};

const STATUS_COLOURS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-orange-100 text-orange-700',
  FIXED: 'bg-purple-100 text-purple-700',
  CLOSED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const CONTRACTOR_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'FIXED'],
  IN_PROGRESS: ['FIXED'],
};

export default function SnagContractorPanel({ tenderId, snags }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionStatus, setActionStatus] = useState('');
  const [fixedNotes, setFixedNotes] = useState('');

  async function updateStatus(snagId: number, status: string, notes: string) {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { status };
      if (status === 'FIXED' && notes.trim()) body.fixed_notes = notes.trim();
      const res = await fetch(`/api/tenders/${tenderId}/snags/${snagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'अपडेट गर्न सकिएन।'); return; }
      setActionId(null);
      setActionStatus('');
      setFixedNotes('');
      router.refresh();
    } finally { setLoading(false); }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="font-semibold mb-4">Snag सूची ({snags.length})</h3>
      {snags.length === 0 ? (
        <p className="text-sm text-gray-500">ग्राहकले कुनै snag थपेका छैनन्।</p>
      ) : (
        <div className="space-y-4">
          {snags.map((s) => {
            const canAct = !!CONTRACTOR_TRANSITIONS[s.status];
            return (
              <div key={s.id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">#{s.item_number}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${PRIORITY_COLOURS[s.priority] ?? 'bg-gray-100 text-gray-700'}`}>{s.priority}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLOURS[s.status] ?? 'bg-gray-100 text-gray-700'}`}>{s.status}</span>
                    </div>
                    <p className="text-sm text-gray-900">{s.description}</p>
                    {s.location_reference && <p className="text-xs text-gray-500 mt-1">स्थान: {s.location_reference}</p>}
                    {s.fixed_notes && <p className="text-xs text-green-700 mt-1">समाधान: {s.fixed_notes}</p>}
                    {s.rejection_reason && <p className="text-xs text-red-600 mt-1">अस्वीकृत: {s.rejection_reason}</p>}
                  </div>
                  {canAct && (
                    <div>
                      {actionId === s.id ? (
                        <div className="space-y-2">
                          {actionStatus === 'FIXED' && (
                            <input
                              type="text"
                              value={fixedNotes}
                              onChange={(e) => setFixedNotes(e.target.value)}
                              placeholder="समाधान विवरण (वैकल्पिक)"
                              className="border border-gray-300 rounded px-2 py-1 text-xs w-48"
                            />
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => updateStatus(s.id, actionStatus, fixedNotes)} disabled={loading} className="px-3 py-1 bg-blue-600 text-white rounded text-xs">पुष्टि</button>
                            <button onClick={() => setActionId(null)} className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs">रद्द</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1 flex-col">
                          {CONTRACTOR_TRANSITIONS[s.status]?.map((next) => (
                            <button
                              key={next}
                              onClick={() => { setActionId(s.id); setActionStatus(next); setFixedNotes(''); }}
                              className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
                            >
                              → {next}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </div>
  );
}
