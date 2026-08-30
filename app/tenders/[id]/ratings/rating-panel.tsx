'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface VisibleRating {
  id: number;
  rating_direction: string;
  score_1: number;
  score_2: number;
  score_3: number;
  score_4: number;
  score_5: number;
  average_score: string;
  review_text: string | null;
  is_anonymous: boolean;
  submitted_at: string;
  rater: { full_name: string };
  rated: { full_name: string };
}

interface MyRating {
  id: number;
  score_1: number;
  score_2: number;
  score_3: number;
  score_4: number;
  score_5: number;
  average_score: string;
  review_text: string | null;
  is_anonymous: boolean;
  is_visible: boolean;
  window_closes_at: string | null;
}

interface Props {
  tenderId: number;
  visibleRatings: VisibleRating[];
  myRating: MyRating | null;
}

const SCORE_LABELS = ['गुणस्तर', 'समयपालन', 'सञ्चार', 'व्यावसायिकता', 'समग्र'];

function StarDisplay({ score }: { score: number }) {
  return (
    <span className="text-amber-500">
      {'★'.repeat(score)}{'☆'.repeat(5 - score)}
    </span>
  );
}

export default function RatingPanel({ tenderId, visibleRatings, myRating }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<number[]>(
    myRating && !myRating.is_visible && myRating.score_1 > 0
      ? [myRating.score_1, myRating.score_2, myRating.score_3, myRating.score_4, myRating.score_5]
      : [0, 0, 0, 0, 0]
  );
  const [reviewText, setReviewText] = useState(myRating?.review_text ?? '');
  const [isAnonymous, setIsAnonymous] = useState(myRating?.is_anonymous ?? false);
  const [submitted, setSubmitted] = useState(false);

  const alreadySubmitted = myRating?.is_visible || submitted;
  const windowClosed = myRating?.window_closes_at ? new Date(myRating.window_closes_at) < new Date() : false;
  const canSubmit = !alreadySubmitted && !windowClosed && myRating !== null;

  async function submitRating() {
    if (scores.some((s) => s === 0)) { setError('कृपया सबै ५ वटा स्कोर दिनुहोस्।'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score_1: scores[0],
          score_2: scores[1],
          score_3: scores[2],
          score_4: scores[3],
          score_5: scores[4],
          review_text: reviewText.trim() || undefined,
          is_anonymous: isAnonymous,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? 'पेश गर्न सकिएन।'); return; }
      setSubmitted(true);
      router.refresh();
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      {/* Submit own rating */}
      {myRating !== null && !alreadySubmitted && !windowClosed && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="font-semibold mb-4">तपाईंको मूल्यांकन</h3>
          {myRating.window_closes_at && (
            <p className="text-xs text-gray-500 mb-4">समयसीमा: {new Date(myRating.window_closes_at).toLocaleDateString('en-GB')}</p>
          )}
          <div className="space-y-3 mb-4">
            {SCORE_LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-sm text-gray-700 w-32">{label}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setScores((prev) => { const next = [...prev]; next[i] = star; return next; })}
                      className={`text-2xl ${scores[i] >= star ? 'text-amber-500' : 'text-gray-300'} hover:text-amber-400`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <span className="text-sm text-gray-500">{scores[i] > 0 ? `${scores[i]}/5` : '—'}</span>
              </div>
            ))}
          </div>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="अतिरिक्त टिप्पणी (वैकल्पिक)…"
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none mb-3"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} className="rounded" />
            गोप्य मूल्यांकन (नाम देखिने छैन)
          </label>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <button onClick={submitRating} disabled={loading || !canSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'पेश हुँदैछ…' : 'मूल्यांकन पेश गर्नुहोस्'}
          </button>
        </div>
      )}

      {alreadySubmitted && !visibleRatings.length && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm text-amber-800">तपाईंको मूल्यांकन पेश भयो। अर्को पक्षको मूल्यांकन पेश भएपछि दुवैको मूल्यांकन देखिनेछ।</p>
        </div>
      )}

      {windowClosed && !alreadySubmitted && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
          <p className="text-sm text-gray-600">मूल्यांकन विन्डो बन्द भयो।</p>
        </div>
      )}

      {/* Visible ratings */}
      {visibleRatings.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="font-semibold mb-4">मूल्यांकन नतिजा</h3>
          <div className="space-y-6">
            {visibleRatings.map((r) => (
              <div key={r.id} className="border-b border-gray-100 pb-6 last:border-0">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {r.is_anonymous ? 'गोप्य' : r.rater.full_name} → {r.rated.full_name}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">({r.rating_direction.replace(/_/g, ' ')})</span>
                  </div>
                  <span className="text-lg font-bold text-amber-600">{Number(r.average_score).toFixed(1)}/5</span>
                </div>
                <div className="grid grid-cols-5 gap-2 text-xs text-center mb-3">
                  {SCORE_LABELS.map((label, i) => (
                    <div key={i}>
                      <div className="text-gray-500 mb-1">{label}</div>
                      <StarDisplay score={[r.score_1, r.score_2, r.score_3, r.score_4, r.score_5][i]} />
                    </div>
                  ))}
                </div>
                {r.review_text && <p className="text-sm text-gray-700 italic">"{r.review_text}"</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
