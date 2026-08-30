import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateBidUser } from '@/lib/bid-user';
import ContractContractorPanel from './contract-contractor-panel';

type Params = { params: Promise<{ id: string }> };

export default async function ContractorContractPage({ params }: Params) {
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
      contract: {
        select: {
          id: true,
          status: true,
          completion_start_date: true,
          completion_end_date: true,
          mobilization_advance_percentage: true,
          retention_percentage: true,
          dlp_months: true,
          contractor_signed_at: true,
          client_signed_at: true,
          current_draft_version: true,
          contract_text: true,
          comments: {
            orderBy: { created_at: 'asc' },
            select: {
              id: true,
              clause_reference: true,
              comment_text: true,
              status: true,
              resolved_at: true,
              created_at: true,
              commenter: { select: { full_name: true } },
            },
          },
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
            <span className="text-sm font-medium text-gray-900">ठेक्का सम्झौता</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/tenders/${tenderId}/snags`} className="text-sm text-blue-600 hover:text-blue-700 underline">Snag List</Link>
            <Link href={`/tenders/${tenderId}/completion`} className="text-sm text-blue-600 hover:text-blue-700 underline">Completion</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <div className="font-mono text-xs text-gray-400">{tender.reference_number}</div>
          <h1 className="text-xl font-bold text-gray-900">{tender.title} — Contract</h1>
        </div>

        <ContractContractorPanel
          tenderId={tenderId}
          contract={tender.contract ? {
            ...tender.contract,
            mobilization_advance_percentage: tender.contract.mobilization_advance_percentage !== null ? String(tender.contract.mobilization_advance_percentage) : null,
            retention_percentage: tender.contract.retention_percentage !== null ? String(tender.contract.retention_percentage) : null,
            completion_start_date: tender.contract.completion_start_date?.toISOString() ?? null,
            completion_end_date: tender.contract.completion_end_date?.toISOString() ?? null,
            contractor_signed_at: tender.contract.contractor_signed_at?.toISOString() ?? null,
            client_signed_at: tender.contract.client_signed_at?.toISOString() ?? null,
            comments: tender.contract.comments.map((c) => ({
              ...c,
              resolved_at: c.resolved_at?.toISOString() ?? null,
              created_at: c.created_at.toISOString(),
            })),
          } : null}
        />
      </div>
    </main>
  );
}
