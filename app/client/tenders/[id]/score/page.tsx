import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateBidUser } from '@/lib/bid-user';
import ScorePanel from './score-panel';
import type { SummaryBid } from './score-panel';

type Params = { params: Promise<{ id: string }> };

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default async function ScoringPage({ params }: Params) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const procurementRoles = ((session.user as any).procurementRoles as string[] | undefined) ?? [];
  if (!procurementRoles.includes('CLIENT')) redirect('/dashboard');

  const bidUser = await getOrCreateBidUser(session.user.email!, session.user.name!, procurementRoles);

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) notFound();

  const tender = await prisma.tender.findFirst({
    where: { id: tenderId, client_user_id: bidUser.id },
    select: { id: true, title: true, reference_number: true, bid_deadline: true, status: true },
  });
  if (!tender) notFound();

  const deadlinePassed = tender.bid_deadline <= new Date();

  let initialSummary: SummaryBid[] = [];

  if (deadlinePassed) {
    const bids = await prisma.bidSubmission.findMany({
      where: {
        tender_id: tenderId,
        status: { in: ['SUBMITTED', 'SHORTLISTED', 'AWARDED', 'NOT_AWARDED'] },
      },
      orderBy: { system_score: 'desc' },
      select: {
        id: true,
        status: true,
        grand_total_npr: true,
        system_score: true,
        price_score: true,
        quantity_score: true,
        outlier_flagged: true,
        client_note: true,
        manual_rank: true,
        bidder: { select: { full_name: true } },
      },
    });

    initialSummary = bids.map((b) => ({
      bid_id: b.id,
      bidder_name: b.bidder.full_name,
      grand_total_npr: b.grand_total_npr ? Number(b.grand_total_npr) : null,
      system_score: b.system_score ? Number(b.system_score) : null,
      price_score: b.price_score ? Number(b.price_score) : null,
      quantity_score: b.quantity_score ? Number(b.quantity_score) : null,
      outlier_flagged: b.outlier_flagged,
      status: b.status,
      shortlisted: b.status === 'SHORTLISTED',
      manual_rank: b.manual_rank,
      client_note: b.client_note,
    }));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <Link href={`/client/tenders/${tenderId}`} className="text-xs text-gray-400 hover:text-gray-600">
            ← {tender.reference_number} — {tender.title}
          </Link>
          <div className="flex items-center gap-4 mt-1">
            <h1 className="text-lg font-bold text-gray-900">Scoring &amp; Comparison</h1>
            <Link href={`/client/tenders/${tenderId}/bids`} className="text-xs text-blue-600 hover:underline">Bids</Link>
            <Link href={`/client/tenders/${tenderId}/award`} className="text-xs text-green-700 hover:underline">Award</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {!deadlinePassed ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p className="text-sm font-semibold text-amber-800 mb-1">Scoring is not yet available</p>
            <p className="text-sm text-amber-700">
              Bid deadline: <strong>{fmtDate(tender.bid_deadline)}</strong>. Scoring and the comparison table will be available once the deadline has passed.
            </p>
          </div>
        ) : (
          <ScorePanel tenderId={tenderId} initialSummary={initialSummary} />
        )}
      </div>
    </div>
  );
}
