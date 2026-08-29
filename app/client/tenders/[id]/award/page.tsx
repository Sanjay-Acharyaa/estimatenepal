import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateBidUser } from '@/lib/bid-user';
import AwardPanel from './award-panel';

type Params = { params: Promise<{ id: string }> };

function fmtNPR(v: number | null): string {
  if (v === null) return '—';
  return `NPR ${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const AWARDABLE_TENDER_STATUSES = ['PUBLISHED', 'UNDER_REVIEW', 'NEGOTIATION', 'AWARDED'];

export default async function AwardPage({ params }: Params) {
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
    select: {
      id: true, title: true, reference_number: true, status: true,
      bid_deadline: true, awarded_amount_npr: true, awarded_at: true,
    },
  });
  if (!tender || !AWARDABLE_TENDER_STATUSES.includes(tender.status)) notFound();

  const bidStatuses = tender.status === 'AWARDED'
    ? ['AWARDED']
    : ['SUBMITTED', 'SHORTLISTED'];

  const bids = await prisma.bidSubmission.findMany({
    where: { tender_id: tenderId, status: { in: bidStatuses } },
    orderBy: { system_score: 'desc' },
    select: {
      id: true, status: true, grand_total_npr: true, total_with_vat_npr: true,
      system_score: true, outlier_flagged: true,
      bidder: { select: { id: true, full_name: true } },
    },
  });

  const winner = tender.status === 'AWARDED' ? bids.find((b) => b.status === 'AWARDED') : null;

  const bidOptions = bids.map((b) => ({
    id: b.id,
    status: b.status,
    bidder_name: b.bidder.full_name,
    grand_total_npr: b.grand_total_npr ? Number(b.grand_total_npr) : null,
    total_with_vat_npr: b.total_with_vat_npr ? Number(b.total_with_vat_npr) : null,
    system_score: b.system_score ? Number(b.system_score) : null,
    outlier_flagged: b.outlier_flagged,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link href={`/client/tenders/${tenderId}`} className="text-xs text-gray-400 hover:text-gray-600">
            ← {tender.reference_number} — {tender.title}
          </Link>
          <div className="flex items-center gap-4 mt-1">
            <h1 className="text-lg font-bold text-gray-900">{tender.status === 'AWARDED' ? 'Project Awarded' : 'Award Bid'}</h1>
            <Link href={`/client/tenders/${tenderId}/bids`} className="text-xs text-blue-600 hover:underline">Bids</Link>
            <Link href={`/client/tenders/${tenderId}/score`} className="text-xs text-blue-600 hover:underline">Score</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6 space-y-4">
        {tender.status === 'AWARDED' && winner ? (
          <>
            <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <p className="text-sm font-semibold text-green-800">Project successfully awarded</p>
              <p className="text-xs text-green-600 mt-0.5">All other bidders have been marked as not awarded.</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Winning bidder</h2>
              <p className="text-base font-semibold text-gray-900">{winner.bidder.full_name}</p>
              <p className="text-xl font-bold text-gray-900 pt-1">
                {fmtNPR(winner.total_with_vat_npr ? Number(winner.total_with_vat_npr) : winner.grand_total_npr ? Number(winner.grand_total_npr) : null)}
              </p>
              {tender.awarded_at && (
                <p className="text-xs text-gray-400 mt-1">
                  Awarded on {new Date(tender.awarded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Letter of Award</h2>
              <AwardPanel tenderId={tenderId} isAwarded={true} bids={bidOptions} />
            </div>
          </>
        ) : (
          <>
            {bids.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
                <p className="text-sm text-gray-500">No shortlisted or submitted bids to award.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Go to the <Link href={`/client/tenders/${tenderId}/score`} className="text-blue-600 hover:underline">scoring page</Link> to evaluate and shortlist bids first.
                </p>
              </div>
            ) : (
              <AwardPanel tenderId={tenderId} isAwarded={false} bids={bidOptions} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
