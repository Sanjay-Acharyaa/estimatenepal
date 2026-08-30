import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateBidUser } from "@/lib/bid-user";
import NegotiateHub from "./negotiate-hub";

type Params = { params: Promise<{ id: string }> };

export default async function NegotiatePage({ params }: Params) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const procurementRoles = ((session.user as any).procurementRoles as string[] | undefined) ?? [];
  if (!procurementRoles.includes("CLIENT")) redirect("/dashboard");

  const bidUser = await getOrCreateBidUser(session.user.email!, session.user.name!, procurementRoles);

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) notFound();

  const tender = await prisma.tender.findFirst({
    where: { id: tenderId, client_user_id: bidUser.id },
    select: { id: true, title: true, reference_number: true, status: true, bid_deadline: true },
  });
  if (!tender) notFound();

  // Shortlisted bids
  const shortlistedBids = await prisma.bidSubmission.findMany({
    where: { tender_id: tenderId, status: "SHORTLISTED" },
    select: {
      id: true,
      bidder_user_id: true,
      grand_total_npr: true,
      total_with_vat_npr: true,
      bidder: { select: { full_name: true } },
    },
  });

  // Existing negotiations
  const negotiations = await prisma.bidNegotiation.findMany({
    where: { tender_id: tenderId },
    orderBy: { initiated_at: "asc" },
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

  const bidOptions = shortlistedBids.map((b) => ({
    id: b.id,
    bidder_user_id: b.bidder_user_id,
    bidder_name: b.bidder.full_name,
    grand_total_npr: b.grand_total_npr ? Number(b.grand_total_npr) : null,
    total_with_vat_npr: b.total_with_vat_npr ? Number(b.total_with_vat_npr) : null,
  }));

  const negotiationItems = negotiations.map((n) => ({
    id: n.id,
    bidder_user_id: n.bidder_user_id,
    bidder_name: n.bidder.full_name,
    status: n.status,
    deadline: n.deadline?.toISOString() ?? null,
    original_grand_total_npr: String(n.original_grand_total_npr),
    current_proposed_total_npr: String(n.current_proposed_total_npr),
    proposed_discount_percentage: Number(n.proposed_discount_percentage),
    initiated_at: n.initiated_at.toISOString(),
    closed_at: n.closed_at?.toISOString() ?? null,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <Link href={`/client/tenders/${tenderId}`} className="text-xs text-gray-400 hover:text-gray-600">
            ← {tender.reference_number} — {tender.title}
          </Link>
          <div className="flex items-center gap-4 mt-1">
            <h1 className="text-lg font-bold text-gray-900">Negotiation</h1>
            <Link href={`/client/tenders/${tenderId}/bids`} className="text-xs text-blue-600 hover:underline">Bids</Link>
            <Link href={`/client/tenders/${tenderId}/score`} className="text-xs text-blue-600 hover:underline">Score</Link>
            <Link href={`/client/tenders/${tenderId}/award`} className="text-xs text-blue-600 hover:underline">Award</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        <NegotiateHub
          tenderId={tenderId}
          tenderStatus={tender.status}
          bidDeadline={tender.bid_deadline.toISOString()}
          shortlistedBids={bidOptions}
          negotiations={negotiationItems}
        />
      </div>
    </div>
  );
}
