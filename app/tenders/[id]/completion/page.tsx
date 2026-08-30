import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateBidUser } from '@/lib/bid-user';
import CompletionContractorPanel from './completion-contractor-panel';

type Params = { params: Promise<{ id: string }> };

export default async function ContractorCompletionPage({ params }: Params) {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const procurementRoles = ((session.user as Record<string, unknown>).procurementRoles as string[] | undefined) ?? [];
  if (!procurementRoles.includes('CONTRACTOR')) redirect('/dashboard');

  const bidUser = await getOrCreateBidUser(session.user.email!, session.user.name!, procurementRoles);

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) notFound();

  const tender = await prisma.tender.findFirst({
    where: {
      id: tenderId,
      submissions: { some: { bidder_user_id: bidUser.id, status: 'AWARDED' } },
    },
    select: {
      id: true,
      title: true,
      reference_number: true,
      status: true,
      snagItems: { select: { status: true } },
      completionRequests: {
        orderBy: { attempt_number: 'desc' },
        select: {
          id: true,
          attempt_number: true,
          completion_notes: true,
          status: true,
          approved_at: true,
          rejected_at: true,
          rejection_reason: true,
          created_at: true,
        },
      },
    },
  });

  if (!tender) notFound();

  const openSnags = tender.snagItems.filter((s) => !['CLOSED', 'REJECTED'].includes(s.status)).length;
  const hasPending = tender.completionRequests.some((r) => r.status === 'PENDING');

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/tenders/${tenderId}`} className="text-sm text-gray-400 hover:text-gray-700">← {tender.title}</Link>
            <span className="text-sm font-medium text-gray-900">Completion</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/tenders/${tenderId}/contract`} className="text-sm text-blue-600 hover:text-blue-700 underline">Contract</Link>
            <Link href={`/tenders/${tenderId}/snags`} className="text-sm text-blue-600 hover:text-blue-700 underline">Snag List</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <div className="font-mono text-xs text-gray-400">{tender.reference_number}</div>
          <h1 className="text-xl font-bold text-gray-900">{tender.title} — Completion</h1>
        </div>

        <CompletionContractorPanel
          tenderId={tenderId}
          tenderStatus={tender.status}
          openSnagCount={openSnags}
          hasPending={hasPending}
          requests={tender.completionRequests.map((r) => ({
            ...r,
            completion_notes: r.completion_notes ?? null,
            rejection_reason: r.rejection_reason ?? null,
            approved_at: r.approved_at?.toISOString() ?? null,
            rejected_at: r.rejected_at?.toISOString() ?? null,
            created_at: r.created_at.toISOString(),
          }))}
        />
      </div>
    </main>
  );
}
