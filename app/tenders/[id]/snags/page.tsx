import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateBidUser } from '@/lib/bid-user';
import SnagContractorPanel from './snag-contractor-panel';

type Params = { params: Promise<{ id: string }> };

export default async function ContractorSnagsPage({ params }: Params) {
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
      snagItems: {
        orderBy: { item_number: 'asc' },
        select: {
          id: true,
          item_number: true,
          description: true,
          location_reference: true,
          priority: true,
          status: true,
          fixed_notes: true,
          rejection_reason: true,
          created_at: true,
          addedBy: { select: { full_name: true } },
        },
      },
    },
  });

  if (!tender) notFound();

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/tenders/${tenderId}`} className="text-sm text-gray-400 hover:text-gray-700">← {tender.title}</Link>
            <span className="text-sm font-medium text-gray-900">Snag List</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/tenders/${tenderId}/contract`} className="text-sm text-blue-600 hover:text-blue-700 underline">Contract</Link>
            <Link href={`/tenders/${tenderId}/completion`} className="text-sm text-blue-600 hover:text-blue-700 underline">Completion</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <div className="font-mono text-xs text-gray-400">{tender.reference_number}</div>
          <h1 className="text-xl font-bold text-gray-900">{tender.title} — Snag List</h1>
        </div>

        <SnagContractorPanel
          tenderId={tenderId}
          snags={tender.snagItems.map((s) => ({
            ...s,
            location_reference: s.location_reference ?? null,
            fixed_notes: s.fixed_notes ?? null,
            rejection_reason: s.rejection_reason ?? null,
            created_at: s.created_at.toISOString(),
          }))}
        />
      </div>
    </main>
  );
}
