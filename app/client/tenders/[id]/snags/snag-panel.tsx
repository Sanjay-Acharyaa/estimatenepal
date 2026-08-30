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
  canAdd: boolean;
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

export default function SnagPanel({ tenderId, snags, canAdd }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [locationRef, setLocationRef] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionStatus, setActionStatus] = useState('');
  const [actionNote, setActionNote] = useState('');

  async function addSnag() {
    if (!description.trim()) { setError('विवरण आवश्यक छ।'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/snags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), location_reference: locationRef.trim() || undefined, priority }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'थप्न सकिएन।'); return; }
      setDescription('');
      setLocationRef('');
      setPriority('MEDIUM');
      router.refresh();
    } finally { setLoading(false); }
  }

  async function updateSnagStatus(snagId: number, status: string, note: string, type: 'rejection_reason' | 'fixed_notes' | null) {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { status };
      if (type === 'rejection_reason') body.rejection_reason = note;
      if (type === 'fixed_notes') body.fixed_notes = note;
      const res = await fetch(`/api/tenders/${tenderId}/snags/${snagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'अपडेट गर्न सकिएन।'); return; }
      setActionId(null);
      setActionStatus('');
      setActionNote('');
      router.refresh();
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      {canAdd && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="font-semibold mb-4">नयाँ Snag थप्नुहोस्</h3>
          <div className="space-y-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="दोष वा समस्याको विवरण…"
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
            <div className="flex gap-3">
              <input
                type="text"
                value={locationRef}
                onChange={(e) => setLocationRef(e.target.value)}
                placeholder="स्थान (वैकल्पिक)"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="HIGH">उच्च</option>
                <option value="MEDIUM">मध्यम</option>
                <option value="LOW">कम</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={addSnag} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'थप्दैछ…' : 'Snag थप्नुहोस्'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="font-semibold mb-4">Snag सूची ({snags.length})</h3>
        {snags.length === 0 ? (
          <p className="text-sm text-gray-500">कुनै snag छैन।</p>
        ) : (
          <div className="space-y-4">
            {snags.map((s) => (
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
                    {s.fixed_notes && <p className="text-xs text-green-700 mt-1">समाधान नोट: {s.fixed_notes}</p>}
                    {s.rejection_reason && <p className="text-xs text-red-600 mt-1">अस्वीकृति कारण: {s.rejection_reason}</p>}
                  </div>
                  {/* Client actions on FIXED snags */}
                  {canAdd && s.status === 'FIXED' && (
                    <div className="flex flex-col gap-2">
                      {actionId === s.id ? (
                        <div className="space-y-2">
                          {actionStatus === 'REJECTED' && (
                            <input
                              type="text"
                              value={actionNote}
                              onChange={(e) => setActionNote(e.target.value)}
                              placeholder="अस्वीकृति कारण"
                              className="border border-gray-300 rounded px-2 py-1 text-xs w-48"
                            />
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateSnagStatus(s.id, actionStatus, actionNote, actionStatus === 'REJECTED' ? 'rejection_reason' : null)}
                              disabled={loading}
                              className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium"
                            >
                              पुष्टि
                            </button>
                            <button onClick={() => setActionId(null)} className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs">रद्द</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => { setActionId(s.id); setActionStatus('CLOSED'); setActionNote(''); }} className="px-2 py-1 bg-green-600 text-white rounded text-xs">बन्द गर्नुहोस्</button>
                          <button onClick={() => { setActionId(s.id); setActionStatus('REJECTED'); setActionNote(''); }} className="px-2 py-1 bg-red-500 text-white rounded text-xs">अस्वीकार</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    </div>
  );
}
