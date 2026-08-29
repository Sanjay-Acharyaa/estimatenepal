import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateBidUser } from '@/lib/bid-user';
import BidList from './bid-list';

type Params = { params: Promise<{ id: string }> };

export default async function TenderBidsPage({ params }: Params) {
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
    select: { id: true, title: true, reference_number: true, status: true },
  });
  if (!tender) notFound();

  const bids = await prisma.bidSubmission.findMany({
    where: {
      tender_id: tenderId,
      status: { in: ['SUBMITTED', 'SHORTLISTED', 'AWARDED', 'NOT_AWARDED', 'REJECTED'] },
    },
    orderBy: { submitted_at: 'asc' },
    select: {
      id: true,
      status: true,
      submitted_at: true,
      version: true,
      grand_total_npr: true,
      system_score: true,
      outlier_flagged: true,
      bidder: { select: { id: true, full_name: true } },
    },
  });

  const initialBids = bids.map((b) => ({
    id: b.id,
    status: b.status,
    submitted_at: b.submitted_at?.toISOString() ?? null,
    version: b.version,
    grand_total_npr: b.grand_total_npr ? Number(b.grand_total_npr) : null,
    system_score: b.system_score ? Number(b.system_score) : null,
    outlier_flagged: b.outlier_flagged,
    bidder_user_id: b.bidder.id,
    bidder_name: b.bidder.full_name,
  }));

  return <BidList tenderId={tenderId} tender={tender} initialBids={initialBids} />;
}
