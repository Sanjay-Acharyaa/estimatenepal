'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Comment {
  id: number;
  clause_reference: string | null;
  comment_text: string;
  status: string;
  resolved_at: string | null;
  created_at: string;
  commenter: { full_name: string };
}

interface Contract {
  id: number;
  status: string;
  completion_start_date: string | null;
  completion_end_date: string | null;
  mobilization_advance_percentage: string | null;
  retention_percentage: string | null;
  dlp_months: number | null;
  contractor_signed_at: string | null;
  client_signed_at: string | null;
  current_draft_version: number;
  contract_text: string;
  comments: Comment[];
}

interface Props {
  tenderId: number;
  contract: Contract | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'मस्यौदा',
  UNDER_REVIEW: 'समीक्षाधीन',
  SIGNED_DIGITAL: 'डिजिटल हस्ताक्षर',
  SIGNED_HARDCOPY: 'हस्तलिखित हस्ताक्षर',
};

export default function ContractContractorPanel({ tenderId, contract }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractText, setContractText] = useState(contract?.contract_text ?? '');
  const [startDate, setStartDate] = useState(contract?.completion_start_date ? contract.completion_start_date.slice(0, 10) : '');
  const [endDate, setEndDate] = useState(contract?.completion_end_date ? contract.completion_end_date.slice(0, 10) : '');
  const [editing, setEditing] = useState(false);
  const [otpStep, setOtpStep] = useState<'idle' | 'sent'>('idle');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  if (!contract) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-2">ठेक्का सम्झौता</h2>
        <p className="text-sm text-gray-500">ग्राहकले अझै ठेक्का सम्झौता सिर्जना गरेका छैनन्।</p>
      </div>
    );
  }

  const isSigned = ['SIGNED_DIGITAL', 'SIGNED_HARDCOPY'].includes(contract.status);

  async function saveEdits() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_text: contractText,
          completion_start_date: startDate || null,
          completion_end_date: endDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'Failed to save.'); return; }
      setEditing(false);
      router.refresh();
    } finally { setLoading(false); }
  }

  async function submitForReview() {
    if (!confirm('ठेक्का मस्यौदा समीक्षाको लागि पेश गर्ने?')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract/submit`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'Failed.'); return; }
      router.refresh();
    } finally { setLoading(false); }
  }

  async function sendOtp() {
    setOtpLoading(true);
    setOtpError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract/sign/otp`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error?.message ?? 'Failed.'); return; }
      setOtpStep('sent');
    } finally { setOtpLoading(false); }
  }

  async function verifyOtp() {
    if (!otpCode.trim()) { setOtpError('OTP कोड आवश्यक छ।'); return; }
    setOtpLoading(true);
    setOtpError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract/sign/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error?.message ?? 'Invalid OTP.'); return; }
      router.refresh();
    } finally { setOtpLoading(false); }
  }

  async function downloadPdf() {
    const res = await fetch(`/api/tenders/${tenderId}/contract/pdf`);
    const data = await res.json();
    if (!res.ok) { alert(data.error?.message ?? 'Failed.'); return; }
    window.open(data.url, '_blank');
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">ठेक्का सम्झौता</h2>
          <div className="flex items-center gap-3">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              contract.status === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
              contract.status === 'UNDER_REVIEW' ? 'bg-amber-100 text-amber-800' :
              'bg-green-100 text-green-700'
            }`}>{STATUS_LABELS[contract.status] ?? contract.status}</span>
            <button onClick={downloadPdf} className="text-sm text-blue-600 hover:text-blue-700 underline">PDF</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          {contract.mobilization_advance_percentage && (
            <div><span className="text-gray-500">अग्रिम भुक्तानी:</span> <span className="font-medium">{String(contract.mobilization_advance_percentage)}%</span></div>
          )}
          {contract.retention_percentage && (
            <div><span className="text-gray-500">प्रतिधारण:</span> <span className="font-medium">{String(contract.retention_percentage)}%</span></div>
          )}
          {contract.dlp_months && (
            <div><span className="text-gray-500">DLP:</span> <span className="font-medium">{contract.dlp_months} महिना</span></div>
          )}
          <div><span className="text-gray-500">तपाईंको हस्ताक्षर:</span> <span className={`font-medium ${contract.contractor_signed_at ? 'text-green-600' : 'text-gray-400'}`}>{contract.contractor_signed_at ? '✓' : 'बाँकी'}</span></div>
          <div><span className="text-gray-500">ग्राहकको हस्ताक्षर:</span> <span className={`font-medium ${contract.client_signed_at ? 'text-green-600' : 'text-gray-400'}`}>{contract.client_signed_at ? '✓' : 'बाँकी'}</span></div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">सुरुवात मिति</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">समाप्ति मिति</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <textarea
              value={contractText}
              onChange={(e) => setContractText(e.target.value)}
              rows={16}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono resize-y"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={saveEdits} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{loading ? 'सुरक्षित…' : 'सुरक्षित गर्नुहोस्'}</button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">रद्द</button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-gray-50 p-4 max-h-80 overflow-y-auto mb-4">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">{contract.contract_text}</pre>
            </div>
            {contract.status === 'DRAFT' && (
              <div className="flex gap-3">
                <button onClick={() => setEditing(true)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">सम्पादन गर्नुहोस्</button>
                <button onClick={submitForReview} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '…' : 'समीक्षाको लागि पेश गर्नुहोस्'}
                </button>
              </div>
            )}
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </>
        )}
      </div>

      {/* Digital signature for contractor */}
      {contract.status === 'UNDER_REVIEW' && !contract.contractor_signed_at && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
          <h3 className="font-semibold text-blue-900 mb-3">डिजिटल हस्ताक्षर</h3>
          {otpStep === 'idle' && (
            <>
              {otpError && <p className="text-sm text-red-600 mb-2">{otpError}</p>}
              <button onClick={sendOtp} disabled={otpLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {otpLoading ? 'पठाउँदैछ…' : 'OTP पठाउनुहोस्'}
              </button>
            </>
          )}
          {otpStep === 'sent' && (
            <div className="space-y-3">
              <p className="text-sm text-blue-800">तपाईंको इमेलमा OTP पठाइएको छ।</p>
              <div className="flex gap-2">
                <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="6 अंकको OTP" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40" maxLength={6} />
                <button onClick={verifyOtp} disabled={otpLoading} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {otpLoading ? '…' : 'प्रमाणित गर्नुहोस्'}
                </button>
              </div>
              {otpError && <p className="text-sm text-red-600">{otpError}</p>}
            </div>
          )}
        </div>
      )}

      {/* Comments */}
      {contract.comments.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="font-semibold mb-3">ग्राहकको टिप्पणीहरू</h3>
          <div className="space-y-3">
            {contract.comments.map((c) => (
              <div key={c.id} className="border-b border-gray-100 pb-3 last:border-0">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{c.commenter.full_name}</span>
                  <span>{new Date(c.created_at).toLocaleDateString('en-GB')}</span>
                </div>
                {c.clause_reference && <div className="text-xs text-gray-500 mb-1">धारा: {c.clause_reference}</div>}
                <p className="text-sm text-gray-700">{c.comment_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
