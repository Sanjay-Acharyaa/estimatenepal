import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ userId: string }> };

const SCORE_LABELS = ['गुणस्तर', 'समयपालन', 'सञ्चार', 'व्यावसायिकता', 'समग्र'];

function StarDisplay({ score }: { score: number }) {
  return (
    <span className="text-amber-500">
      {'★'.repeat(score)}{'☆'.repeat(5 - score)}
    </span>
  );
}

export default async function ContractorRatingsPage({ params }: Params) {
  const { userId } = await params;
  const userIdInt = parseInt(userId, 10);
  if (isNaN(userIdInt)) notFound();

  const contractor = await prisma.bidUser.findFirst({
    where: { id: userIdInt, role: 'CONTRACTOR' },
    select: { id: true, full_name: true, account_type: true, created_at: true },
  });

  if (!contractor) notFound();

  const ratings = await prisma.bidRating.findMany({
    where: {
      rated_user_id: userIdInt,
      rating_direction: 'CLIENT_RATES_CONTRACTOR',
      is_visible: true,
    },
    orderBy: { submitted_at: 'desc' },
    select: {
      id: true,
      score_1: true,
      score_2: true,
      score_3: true,
      score_4: true,
      score_5: true,
      average_score: true,
      review_text: true,
      is_anonymous: true,
      submitted_at: true,
      rater: { select: { full_name: true } },
      tender: { select: { title: true, reference_number: true } },
    },
  });

  const avgOverall = ratings.length > 0
    ? (ratings.reduce((sum, r) => sum + Number(r.average_score), 0) / ratings.length).toFixed(2)
    : null;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center gap-4">
          <Link href="/tenders" className="text-sm text-gray-400 hover:text-gray-700">← Tenders</Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h1 className="text-xl font-bold text-gray-900">{contractor.full_name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span>{contractor.account_type === 'COMPANY' ? 'कम्पनी' : 'व्यक्तिगत'}</span>
            <span>सदस्य भएको मिति: {contractor.created_at.getFullYear()}</span>
          </div>
          {avgOverall && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-3xl font-bold text-amber-600">{avgOverall}</span>
              <span className="text-amber-500 text-2xl">{'★'.repeat(Math.round(parseFloat(avgOverall)))}{'☆'.repeat(5 - Math.round(parseFloat(avgOverall)))}</span>
              <span className="text-sm text-gray-500">({ratings.length} मूल्यांकन)</span>
            </div>
          )}
          {!avgOverall && (
            <p className="text-sm text-gray-500 mt-3">अझै कुनै मूल्यांकन छैन।</p>
          )}
        </div>

        {ratings.map((r) => (
          <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-medium text-gray-900 text-sm">{r.tender.title}</div>
                <div className="text-xs text-gray-400 font-mono">{r.tender.reference_number}</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-amber-600">{Number(r.average_score).toFixed(1)}/5</div>
                <div className="text-xs text-gray-400">{new Date(r.submitted_at).toLocaleDateString('en-GB')}</div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 text-xs text-center mb-3">
              {SCORE_LABELS.map((label, i) => (
                <div key={i}>
                  <div className="text-gray-500 mb-1">{label}</div>
                  <StarDisplay score={[r.score_1, r.score_2, r.score_3, r.score_4, r.score_5][i]} />
                </div>
              ))}
            </div>

            {r.review_text && (
              <blockquote className="border-l-4 border-amber-200 pl-3 text-sm text-gray-700 italic">
                "{r.review_text}"
              </blockquote>
            )}
            <div className="text-xs text-gray-400 mt-2">
              — {r.is_anonymous ? 'गोप्य ग्राहक' : r.rater.full_name}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
