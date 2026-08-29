import { redirect } from "next/navigation";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getOrCreateBidUser } from "@/lib/bid-user";
import BidForm from "./bid-form";

type Params = { params: Promise<{ id: string; bidId: string }> };

export default async function BidPage({ params }: Params) {
  const cookieStore = cookies();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = await getToken({ req: { cookies: Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value])) } as any, secret: process.env.NEXTAUTH_SECRET });
  if (!token) redirect("/login");

  const procurementRoles = (token.procurementRoles as string[] | undefined) ?? [];
  if (!procurementRoles.includes("CONTRACTOR")) redirect("/tenders");

  const bidUser = await getOrCreateBidUser(token.email as string, token.name as string, procurementRoles);

  const { id, bidId } = await params;
  const tenderId = parseInt(id, 10);
  const bidIdInt = parseInt(bidId, 10);
  if (isNaN(tenderId) || isNaN(bidIdInt)) redirect("/contractor/bids");

  const bid = await prisma.bidSubmission.findFirst({
    where: { id: bidIdInt, tender_id: tenderId, bidder_user_id: bidUser.id },
    select: {
      id: true,
      tender_id: true,
      status: true,
      version: true,
      contingency_percentage: true,
      notes_to_client: true,
      submitted_at: true,
      withdrawn_at: true,
      withdrawal_count: true,
    },
  });

  if (!bid) redirect(`/tenders/${tenderId}`);

  const [tender, chapters, lineItems, maxWithdrawalSetting, revisionSetting] = await Promise.all([
    prisma.tender.findUnique({
      where: { id: tenderId },
      select: { quantity_visibility: true, vat_percentage: true, title: true, reference_number: true, bid_deadline: true, status: true },
    }),
    prisma.bidBoqChapter.findMany({
      where: { tender_id: tenderId },
      orderBy: { sort_order: "asc" },
      select: {
        id: true,
        title: true,
        sort_order: true,
        items: {
          orderBy: { sort_order: "asc" },
          select: { id: true, description: true, unit: true, client_quantity: true, sort_order: true },
        },
      },
    }),
    prisma.bidSubmissionLineItem.findMany({
      where: { bid_id: bidIdInt },
      select: { id: true, boq_item_id: true, bidder_quantity: true, bidder_rate_npr: true, amount_npr: true, quantity_justification: true },
    }),
    prisma.bidPlatformSetting.findUnique({ where: { key: "max_withdrawals_per_bid" }, select: { value: true } }),
    prisma.bidPlatformSetting.findUnique({ where: { key: "feature_bid_revision" }, select: { value: true } }),
  ]);

  if (!tender) redirect("/contractor/bids");

  const lineItemMap = new Map(lineItems.map((li) => [li.boq_item_id, li]));
  const showClientQty = tender.quantity_visibility === "VISIBLE";
  const now = new Date();
  const deadlinePassed = tender.bid_deadline < now;
  const isEditable =
    bid.status === "DRAFT" ||
    (bid.status === "SUBMITTED" && tender.bid_deadline > now && tender.status === "PUBLISHED");

  const bidData = {
    id: bid.id,
    tender_id: bid.tender_id,
    status: bid.status,
    version: bid.version,
    contingency_percentage: bid.contingency_percentage ? String(bid.contingency_percentage) : null,
    notes_to_client: bid.notes_to_client,
    submitted_at: bid.submitted_at?.toISOString() ?? null,
    withdrawn_at: bid.withdrawn_at?.toISOString() ?? null,
    withdrawal_count: bid.withdrawal_count,
    max_withdrawals: parseInt(maxWithdrawalSetting?.value ?? "1", 10),
    quantity_visibility: tender.quantity_visibility,
    vat_percentage: Number(tender.vat_percentage),
    tender_title: tender.title,
    tender_reference: tender.reference_number,
    bid_deadline: tender.bid_deadline.toISOString(),
    is_editable: isEditable,
    deadline_passed: deadlinePassed,
    revision_enabled: revisionSetting?.value === "true",
    chapters: chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      sort_order: ch.sort_order,
      items: ch.items.map((item) => {
        const li = lineItemMap.get(item.id) ?? null;
        return {
          boq_item_id: item.id,
          description: item.description,
          unit: item.unit,
          client_quantity: showClientQty && item.client_quantity != null ? String(item.client_quantity) : null,
          line_item: li
            ? {
                id: li.id,
                bidder_quantity: li.bidder_quantity ? String(li.bidder_quantity) : null,
                bidder_rate_npr: String(li.bidder_rate_npr),
                amount_npr: String(li.amount_npr),
                quantity_justification: li.quantity_justification,
              }
            : null,
        };
      }),
    })),
  };

  return <BidForm tenderId={tenderId} bidId={bidIdInt} bid={bidData} />;
}
