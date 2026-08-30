import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateBidUser } from "@/lib/bid-user";
import NegotiationThread from "./thread";

type Params = { params: Promise<{ id: string; negId: string }> };

export default async function NegotiationThreadPage({ params }: Params) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const procurementRoles = ((session.user as any).procurementRoles as string[] | undefined) ?? [];
  if (!procurementRoles.includes("CLIENT")) redirect("/dashboard");

  const bidUser = await getOrCreateBidUser(session.user.email!, session.user.name!, procurementRoles);

  const { id, negId } = await params;
  const tenderId = parseInt(id, 10);
  const negotiationId = parseInt(negId, 10);
  if (isNaN(tenderId) || isNaN(negotiationId)) notFound();

  const tender = await prisma.tender.findFirst({
    where: { id: tenderId, client_user_id: bidUser.id },
    select: { id: true, title: true, reference_number: true, status: true },
  });
  if (!tender) notFound();

  const neg = await prisma.bidNegotiation.findFirst({
    where: { id: negotiationId, tender_id: tenderId },
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
      bidder: { select: { full_name: true } },
    },
  });
  if (!neg) notFound();

  const messages = await prisma.bidNegotiationMessage.findMany({
    where: { negotiation_id: negotiationId },
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

  const negotiation = {
    id: neg.id,
    bidder_user_id: neg.bidder_user_id,
    bidder_name: neg.bidder.full_name,
    status: neg.status,
    deadline: neg.deadline?.toISOString() ?? null,
    original_grand_total_npr: String(neg.original_grand_total_npr),
    current_proposed_total_npr: String(neg.current_proposed_total_npr),
    proposed_discount_percentage: Number(neg.proposed_discount_percentage),
    initiated_at: neg.initiated_at.toISOString(),
    closed_at: neg.closed_at?.toISOString() ?? null,
  };

  const initialMessages = messages.map((m) => ({
    id: m.id,
    sender_user_id: m.sender_user_id,
    sender_name: m.sender.full_name,
    message_type: m.message_type,
    message_text: m.message_text,
    created_at: m.created_at.toISOString(),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <Link href={`/client/tenders/${tenderId}/negotiate`} className="text-xs text-gray-400 hover:text-gray-600">
            ← All negotiations
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-lg font-bold text-gray-900">
              Negotiation — {neg.bidder.full_name}
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{tender.reference_number} — {tender.title}</p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        <NegotiationThread
          tenderId={tenderId}
          clientUserId={bidUser.id}
          negotiation={negotiation}
          initialMessages={initialMessages}
        />
      </div>
    </div>
  );
}
