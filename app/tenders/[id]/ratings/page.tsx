import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateBidUser } from '@/lib/bid-user';
import RatingPanel from './rating-panel';

type Params = { params: Promise<{ id: string }> };

export default async function RatingsPage({ params }: Params) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const procurementRoles = ((session.user as Record<string, unknown>).procurementRoles as string[] | undefined) ?? [];
  const isClient = procurementRoles.includes('CLIENT');
  const isContractor = procurementRoles.includes('CONTRACTOR');

  if (!isClient && !isContractor) redirect('/dashboard');

  const bidUser = await getOrCreateBidUser(session.user.email!, session.user.name!, procurementRoles);

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) notFound();

  const tender = await prisma.tender.findFirst({
    where: {
      id: tenderId,
      ...(isClient ? { client_user_id: bidUser.id } : {}),
      ...(isContractor ? { submissions: { some: { bidder_user_id: bidUser.id, status: 'AWARDED' } } } : {}),
    },
    select: {
      id: true,
      title: true,
      reference_number: true,
      status: true,
    },
  });

  if (!tender) notFound();

  const [visibleRatings, myRating] = await Promise.all([
    prisma.bidRating.findMany({
      where: { tender_id: tenderId, is_visible: true },
      select: {
        id: true,
        rating_direction: true,
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
        rated: { select: { full_name: true } },
      },
    }),
    prisma.bidRating.findFirst({
      where: { tender_id: tenderId, rater_user_id: bidUser.id },
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
        is_visible: true,
        window_closes_at: true,
      },
    }),
  ]);

  const backUrl = isClient ? `/client/tenders/${tenderId}` : `/tenders/${tenderId}`;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={backUrl} className="text-sm text-gray-400 hover:text-gray-700">← {tender.title}</Link>
            <span className="text-sm font-medium text-gray-900">मूल्यांकन</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <div className="font-mono text-xs text-gray-400">{tender.reference_number}</div>
          <h1 className="text-xl font-bold text-gray-900">{tender.title} — Ratings</h1>
        </div>

        <RatingPanel
          tenderId={tenderId}
          visibleRatings={visibleRatings.map((r) => ({
            ...r,
            average_score: String(r.average_score),
            review_text: r.review_text ?? null,
            submitted_at: r.submitted_at.toISOString(),
          }))}
          myRating={myRating ? {
            ...myRating,
            average_score: String(myRating.average_score),
            review_text: myRating.review_text ?? null,
            window_closes_at: myRating.window_closes_at?.toISOString() ?? null,
          } : null}
        />
      </div>
    </main>
  );
}
