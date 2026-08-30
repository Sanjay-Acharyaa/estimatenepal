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
  price_escalation_type: string;
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
  isAwarded: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  UNDER_REVIEW: 'Under Review',
  SIGNED_DIGITAL: 'Digitally Signed',
  SIGNED_HARDCOPY: 'Hardcopy Signed',
};

export default function ContractPanel({ tenderId, contract, isAwarded }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [clauseRef, setClauseRef] = useState('');
  const [otpStep, setOtpStep] = useState<'idle' | 'sent' | 'verified'>('idle');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [hardcopyFile, setHardcopyFile] = useState<File | null>(null);
  const [hardcopyLoading, setHardcopyLoading] = useState(false);

  async function createContract() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'Failed to create contract.'); return; }
      router.refresh();
    } finally { setLoading(false); }
  }

  async function requestChanges() {
    if (!commentText.trim()) { setError('Please enter your feedback.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_text: commentText.trim(), clause_reference: clauseRef.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'Failed.'); return; }
      setCommentText('');
      setClauseRef('');
      router.refresh();
    } finally { setLoading(false); }
  }

  async function sendOtp() {
    setOtpLoading(true);
    setOtpError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract/sign/otp`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error?.message ?? 'Failed to send OTP.'); return; }
      setOtpStep('sent');
    } finally { setOtpLoading(false); }
  }

  async function verifyOtp() {
    if (!otpCode.trim()) { setOtpError('Enter the OTP code.'); return; }
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
      setOtpStep('verified');
      router.refresh();
    } finally { setOtpLoading(false); }
  }

  async function uploadHardcopy() {
    if (!hardcopyFile) return;
    setHardcopyLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract/sign/hardcopy`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'Failed.'); return; }
      const uploadRes = await fetch(data.upload_url, {
        method: 'PUT',
        body: hardcopyFile,
        headers: { 'Content-Type': 'application/pdf' },
      });
      if (!uploadRes.ok) { setError('Upload to storage failed.'); return; }
      router.refresh();
    } finally { setHardcopyLoading(false); }
  }

  async function downloadPdf() {
    const res = await fetch(`/api/tenders/${tenderId}/contract/pdf`);
    const data = await res.json();
    if (!res.ok) { alert(data.error?.message ?? 'Failed to generate PDF.'); return; }
    window.open(data.url, '_blank');
  }

  if (!contract) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">ठेक्का सम्झौता</h2>
        {!isAwarded ? (
          <p className="text-sm text-gray-500">ठेक्का स्वीकृत (AWARDED) भएपछि सम्झौता सिर्जना गर्न सकिन्छ।</p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">ठेकेदारलाई ठेक्का सम्झौताको मस्यौदा पठाउन निम्न बटन थिच्नुहोस्।</p>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <button
              onClick={createContract}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'सिर्जना हुँदैछ…' : 'ठेक्का मस्यौदा सिर्जना गर्नुहोस्'}
            </button>
          </>
        )}
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[contract.status] ?? contract.status;
  const isSigned = ['SIGNED_DIGITAL', 'SIGNED_HARDCOPY'].includes(contract.status);

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
            }`}>{statusLabel}</span>
            <button onClick={downloadPdf} className="text-sm text-blue-600 hover:text-blue-700 underline">PDF डाउनलोड</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div><span className="text-gray-500">मस्यौदा संस्करण:</span> <span className="font-medium">v{contract.current_draft_version}</span></div>
          <div><span className="text-gray-500">मूल्य वृद्धि:</span> <span className="font-medium">{contract.price_escalation_type}</span></div>
          {contract.mobilization_advance_percentage && (
            <div><span className="text-gray-500">अग्रिम भुक्तानी:</span> <span className="font-medium">{String(contract.mobilization_advance_percentage)}%</span></div>
          )}
          {contract.retention_percentage && (
            <div><span className="text-gray-500">प्रतिधारण:</span> <span className="font-medium">{String(contract.retention_percentage)}%</span></div>
          )}
          {contract.dlp_months && (
            <div><span className="text-gray-500">DLP:</span> <span className="font-medium">{contract.dlp_months} महिना</span></div>
          )}
          <div><span className="text-gray-500">ग्राहकको हस्ताक्षर:</span> <span className={`font-medium ${contract.client_signed_at ? 'text-green-600' : 'text-gray-400'}`}>{contract.client_signed_at ? '✓ हस्ताक्षर भयो' : 'बाँकी'}</span></div>
          <div><span className="text-gray-500">ठेकेदारको हस्ताक्षर:</span> <span className={`font-medium ${contract.contractor_signed_at ? 'text-green-600' : 'text-gray-400'}`}>{contract.contractor_signed_at ? '✓ हस्ताक्षर भयो' : 'बाँकी'}</span></div>
        </div>

        <div className="rounded-lg bg-gray-50 p-4 max-h-80 overflow-y-auto">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">{contract.contract_text}</pre>
        </div>
      </div>

      {/* Digital signature */}
      {contract.status === 'UNDER_REVIEW' && !contract.client_signed_at && (
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
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="6 अंकको OTP"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40"
                  maxLength={6}
                />
                <button onClick={verifyOtp} disabled={otpLoading} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {otpLoading ? 'प्रमाणित…' : 'प्रमाणित गर्नुहोस्'}
                </button>
              </div>
              {otpError && <p className="text-sm text-red-600">{otpError}</p>}
            </div>
          )}
        </div>
      )}

      {/* Hardcopy upload */}
      {!isSigned && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="font-semibold mb-3">हस्तलिखित ठेक्का अपलोड</h3>
          <p className="text-sm text-gray-500 mb-3">दुवैतर्फ हस्ताक्षर भएको PDF अपलोड गर्नुहोस्।</p>
          <div className="flex gap-3 items-center">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setHardcopyFile(e.target.files?.[0] ?? null)}
              className="text-sm text-gray-600"
            />
            <button
              onClick={uploadHardcopy}
              disabled={!hardcopyFile || hardcopyLoading}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {hardcopyLoading ? 'अपलोड…' : 'अपलोड गर्नुहोस्'}
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {/* Request changes */}
      {contract.status === 'UNDER_REVIEW' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h3 className="font-semibold text-amber-900 mb-3">परिवर्तनको अनुरोध</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={clauseRef}
              onChange={(e) => setClauseRef(e.target.value)}
              placeholder="धारा सन्दर्भ (वैकल्पिक)"
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="परिवर्तनको विवरण…"
              rows={3}
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={requestChanges} disabled={loading} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
              {loading ? 'पठाउँदैछ…' : 'परिवर्तन अनुरोध पठाउनुहोस्'}
            </button>
          </div>
        </div>
      )}

      {/* Comments history */}
      {contract.comments.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="font-semibold mb-3">टिप्पणीहरू</h3>
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
