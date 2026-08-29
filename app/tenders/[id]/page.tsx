import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { DeadlineUrgencyChip } from "@/components/ui/DeadlineUrgencyChip";
import TenderActions from "./tender-actions";
import WatchButton from "./watch-button";

type Params = { params: Promise<{ id: string }> };

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtNPR(val: unknown): string {
  if (val == null) return "—";
  return `NPR ${Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right max-w-xs">{value}</span>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  UNDER_REVIEW: "Under Review",
  NEGOTIATION: "Negotiation",
  AWARDED: "Awarded",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_COLOURS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PUBLISHED: "bg-blue-100 text-blue-700",
  UNDER_REVIEW: "bg-amber-100 text-amber-800",
  NEGOTIATION: "bg-orange-100 text-orange-700",
  AWARDED: "bg-green-100 text-green-700",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function TenderDetailPage({ params }: Params) {
  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) notFound();

  const session = await getSession();
  const procurementRoles = ((session?.user as { procurementRoles?: string[] } | undefined)?.procurementRoles) ?? [];
  const isContractor = procurementRoles.includes("CONTRACTOR");

  let invitation: { id: number; status: string } | null = null;
  let existingRtb: { status: string } | null = null;
  let existingBidId: number | null = null;
  let existingBidStatus: string | null = null;
  let isWatching = false;

  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    select: {
      id: true,
      reference_number: true,
      title: true,
      description: true,
      district: true,
      location_detail: true,
      tender_type: true,
      status: true,
      bid_deadline: true,
      qanda_deadline: true,
      estimated_value: true,
      show_estimated_value_on_card: true,
      show_client_identity_on_card: true,
      site_visit_required: true,
      site_visit_scheduled_at: true,
      site_visit_location: true,
      bid_security_required: true,
      bid_security_percentage: true,
      quantity_visibility: true,
      require_rtb_approval: true,
      instructions_to_bidders: true,
      estimation_project_id: true,
      client_user_id: true,
      created_at: true,
      client: { select: { full_name: true } },
      boqChapters: {
        orderBy: { sort_order: "asc" },
        select: {
          id: true,
          title: true,
          items: {
            orderBy: { sort_order: "asc" },
            select: {
              id: true,
              description: true,
              unit: true,
              client_quantity: true,
            },
          },
        },
      },
    },
  });

  if (!tender) notFound();

  // DRAFT tenders only visible to the owning client
  if (tender.status === "DRAFT") {
    if (!session?.user) notFound();
  }

  // Fetch contractor-specific data when viewing a PUBLISHED tender
  if (isContractor && tender.status === "PUBLISHED" && session?.user) {
    const bidUser = await getOrCreateBidUser(
      session.user.email as string,
      session.user.name as string,
      procurementRoles
    );
    const [inv, rtb, bid, watch] = await Promise.all([
      prisma.bidTenderInvitation.findFirst({
        where: { tender_id: tenderId, contractor_user_id: bidUser.id, status: { in: ["PENDING", "ACCEPTED", "DECLINED"] } },
        orderBy: { invited_at: "desc" },
        select: { id: true, status: true },
      }),
      prisma.bidTenderRequestToBid.findFirst({
        where: { tender_id: tenderId, contractor_user_id: bidUser.id, status: { in: ["PENDING", "APPROVED"] } },
        select: { status: true },
      }),
      prisma.bidSubmission.findFirst({
        where: { tender_id: tenderId, bidder_user_id: bidUser.id, status: { in: ["DRAFT", "SUBMITTED", "WITHDRAWN"] } },
        select: { id: true, status: true },
      }),
      prisma.bidTenderWatchlist.findUnique({
        where: { user_id_tender_id: { user_id: bidUser.id, tender_id: tenderId } },
        select: { id: true },
      }),
    ]);
    invitation = inv;
    existingRtb = rtb;
    existingBidId = bid?.id ?? null;
    existingBidStatus = bid?.status ?? null;
    isWatching = watch !== null;
  }

  const statusLabel = STATUS_LABELS[tender.status] ?? tender.status;
  const statusColour = STATUS_COLOURS[tender.status] ?? "bg-gray-100 text-gray-700";
  const showBOQQuantities = tender.quantity_visibility === "VISIBLE";

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
          <Link href="/tenders" className="text-sm text-gray-400 hover:text-gray-700">
            ← Open Tenders
          </Link>
          <div className="flex items-center gap-3">
            {isContractor && tender.status === "PUBLISHED" && !existingBidId && (
              <WatchButton tenderId={tenderId} initialWatching={isWatching} />
            )}
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusColour}`}>
              {statusLabel}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        {/* Title block */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">{tender.reference_number}</div>
          <h1 className="text-xl font-bold text-gray-900">{tender.title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tender.tender_type === "PUBLIC" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
              {tender.tender_type === "PUBLIC" ? "Public" : "Invitation only"}
            </span>
            <DeadlineUrgencyChip deadline={tender.bid_deadline} />
            {tender.estimation_project_id && (
              <Link
                href={`/dashboard/projects/${tender.estimation_project_id}`}
                className="text-xs text-indigo-600 hover:underline"
              >
                View Estimation Project
              </Link>
            )}
          </div>
          {session?.user && (tender.status === "PUBLISHED") && (
            <div className="pt-2">
              <Link
                href={`/api/auth/sso-token?redirect=/bid/tenders/${tender.id}`}
                className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Open in Bidding Platform
              </Link>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Description</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{tender.description}</p>
        </div>

        {/* Q&A link */}
        {tender.status === "PUBLISHED" && (
          <div className="flex justify-end">
            <a
              href={`/tenders/${tenderId}/qanda`}
              className="text-sm text-blue-600 hover:underline"
            >
              Questions &amp; Answers →
            </a>
          </div>
        )}

        {/* Contractor action panel */}
        {tender.status === "PUBLISHED" && (
          <TenderActions
            tenderId={tenderId}
            tenderType={tender.tender_type as "PUBLIC" | "INVITATION_ONLY"}
            invitation={invitation}
            existingRtb={existingRtb}
            existingBidId={existingBidId}
            existingBidStatus={existingBidStatus}
            isLoggedIn={!!session?.user}
            isContractor={isContractor}
          />
        )}

        {/* Key dates */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Key dates &amp; details</h2>
          <InfoRow label="District" value={tender.district} />
          {tender.location_detail && <InfoRow label="Location detail" value={tender.location_detail} />}
          <InfoRow label="Bid deadline" value={fmtDate(tender.bid_deadline)} />
          {tender.qanda_deadline && (
            <InfoRow label="Q&amp;A deadline" value={fmtDate(tender.qanda_deadline)} />
          )}
          {tender.show_estimated_value_on_card && (
            <InfoRow label="Estimated value" value={fmtNPR(tender.estimated_value)} />
          )}
          {tender.show_client_identity_on_card && (
            <InfoRow label="Client" value={tender.client.full_name} />
          )}
          {tender.site_visit_required && (
            <>
              <InfoRow label="Site visit" value="Required" />
              {tender.site_visit_scheduled_at && (
                <InfoRow label="Site visit date" value={fmtDate(tender.site_visit_scheduled_at)} />
              )}
              {tender.site_visit_location && (
                <InfoRow label="Site visit location" value={tender.site_visit_location} />
              )}
            </>
          )}
          {tender.bid_security_required && (
            <InfoRow
              label="Bid security"
              value={`${Number(tender.bid_security_percentage).toFixed(2)}%`}
            />
          )}
          {tender.require_rtb_approval && (
            <InfoRow label="Bidding access" value="Approval required" />
          )}
        </div>

        {/* BOQ */}
        {tender.boqChapters.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Bill of Quantities</h2>
              {isContractor && tender.status === "PUBLISHED" && (
                <a
                  href={`/api/tenders/${tenderId}/boq/export`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Download XLSX →
                </a>
              )}
            </div>
            {!showBOQQuantities && (
              <p className="text-xs text-gray-400 mb-4">Quantities are hidden — contractors must supply their own.</p>
            )}
            <div className="space-y-4">
              {tender.boqChapters.map((chapter) => (
                <div key={chapter.id}>
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    {chapter.title}
                  </h3>
                  {chapter.items.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="pb-1.5 pr-4 text-left font-medium text-gray-500">Description</th>
                            <th className="pb-1.5 pr-4 text-left font-medium text-gray-500">Unit</th>
                            {showBOQQuantities && (
                              <th className="pb-1.5 text-right font-medium text-gray-500">Qty</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {chapter.items.map((item) => (
                            <tr key={item.id}>
                              <td className="py-1.5 pr-4 text-gray-700">{item.description}</td>
                              <td className="py-1.5 pr-4 text-gray-500">{item.unit}</td>
                              {showBOQQuantities && (
                                <td className="py-1.5 text-right tabular-nums text-gray-700">
                                  {item.client_quantity != null
                                    ? Number(item.client_quantity).toFixed(2)
                                    : "—"}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        {tender.instructions_to_bidders && (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Instructions to bidders</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{tender.instructions_to_bidders}</p>
          </div>
        )}
      </div>
    </main>
  );
}
