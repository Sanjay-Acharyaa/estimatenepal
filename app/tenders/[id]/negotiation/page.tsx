import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateBidUser } from "@/lib/bid-user";
import ContractorNegotiationThread from "./negotiation-thread";

type Params = { params: Promise<{ id: string }> };

export default async function ContractorNegotiationPage({ params }: Params) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const procurementRoles = ((session.user as any).procurementRoles as string[] | undefined) ?? [];
  if (!procurementRoles.includes("CONTRACTOR")) redirect("/tenders");

  const bidUser = await getOrCreateBidUser(session.user.email!, session.user.name!, procurementRoles);

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) redirect("/tenders");

  const tender = await prisma.tender.findFirst({
    where: { id: tenderId, status: { in: ["UNDER_REVIEW", "NEGOTIATION", "AWARDED"] } },
    select: { id: true, title: true, reference_number: true, status: true },
  });

  const bid = tender
    ? await prisma.bidSubmission.findFirst({
        where: { tender_id: tenderId, bidder_user_id: bidUser.id, status: { not: "WITHDRAWN" } },
        select: { id: true, status: true, grand_total_npr: true },
      })
    : null;

  if (!tender || !bid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-sm font-semibold text-gray-600 mb-1">Not in negotiation</p>
          <p className="text-sm text-gray-400 mb-4">
            This tender is not currently in negotiation, or you do not have a bid on it.
          </p>
          <Link href="/tenders" className="text-xs text-blue-600 hover:underline">← Open Tenders</Link>
        </div>
      </div>
    );
  }

  const negotiation = await prisma.bidNegotiation.findFirst({
    where: { tender_id: tenderId, bidder_user_id: bidUser.id },
    orderBy: { initiated_at: "desc" },
    select: {
      id: true,
      bidder_user_id: true,
      status: true,
      deadline: true,
      original_grand_total_npr: true,
      current_proposed_total_npr: true,
      proposed_discount_percentage: true,
      initiated_at: true,
      closed_at: true,
    },
  });

  if (!negotiation) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="mx-auto max-w-5xl">
            <Link href="/tenders" className="text-xs text-gray-400 hover:text-gray-600">← Open Tenders</Link>
            <h1 className="mt-1 text-lg font-bold text-gray-900">{tender.title}</h1>
            <p className="text-xs font-mono text-gray-400">{tender.reference_number}</p>
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
            <p className="text-sm font-semibold text-gray-600 mb-1">Not in active negotiation</p>
            <p className="text-xs text-gray-400">
              The client has not opened a negotiation thread with you yet. Check back later.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const messages = await prisma.bidNegotiationMessage.findMany({
    where: { negotiation_id: negotiation.id },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      sender_user_id: true,
      message_type: true,
      message_text: true,
      created_at: true,
      sender: { select: { full_name: true } },
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <Link href="/tenders" className="text-xs text-gray-400 hover:text-gray-600">← Open Tenders</Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900">{tender.title}</h1>
            <span className="font-mono text-xs text-gray-400">{tender.reference_number}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Negotiation thread</p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        <ContractorNegotiationThread
          tenderId={tenderId}
          contractorUserId={bidUser.id}
          negotiation={{
            id: negotiation.id,
            bidder_user_id: negotiation.bidder_user_id,
            status: negotiation.status,
            deadline: negotiation.deadline?.toISOString() ?? null,
            original_grand_total_npr: String(negotiation.original_grand_total_npr),
            current_proposed_total_npr: String(negotiation.current_proposed_total_npr),
            proposed_discount_percentage: Number(negotiation.proposed_discount_percentage),
            initiated_at: negotiation.initiated_at.toISOString(),
            closed_at: negotiation.closed_at?.toISOString() ?? null,
          }}
          initialMessages={messages.map((m) => ({
            id: m.id,
            sender_user_id: m.sender_user_id,
            sender_name: m.sender.full_name,
            message_type: m.message_type,
            message_text: m.message_text,
            created_at: m.created_at.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
