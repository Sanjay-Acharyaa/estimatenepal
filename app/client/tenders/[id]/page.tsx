import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateBidUser } from "@/lib/bid-user";
import PublishButton from "./PublishButton";
import CloseBidsButton from "./close-bids-button";

type Params = { params: Promise<{ id: string }> };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", PUBLISHED: "Published", UNDER_REVIEW: "Under Review",
  NEGOTIATION: "Negotiation", AWARDED: "Awarded", CONTRACT_SIGNED: "Contract Signed",
  COMPLETED: "Completed", CANCELLED: "Cancelled",
};

const STATUS_COLOURS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700", PUBLISHED: "bg-blue-100 text-blue-700",
  UNDER_REVIEW: "bg-amber-100 text-amber-800", NEGOTIATION: "bg-orange-100 text-orange-700",
  AWARDED: "bg-green-100 text-green-700", COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-700",
};

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right max-w-xs">{value}</span>
    </div>
  );
}

export default async function ClientTenderDetailPage({ params }: Params) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const procurementRoles = ((session.user as any).procurementRoles as string[] | undefined) ?? [];
  if (!procurementRoles.includes("CLIENT")) redirect("/dashboard");

  const bidUser = await getOrCreateBidUser(
    session.user.email!,
    session.user.name!,
    procurementRoles
  );

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) notFound();

  const tender = await prisma.tender.findFirst({
    where: { id: tenderId, client_user_id: bidUser.id },
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
      site_visit_required: true,
      site_visit_scheduled_at: true,
      site_visit_location: true,
      quantity_visibility: true,
      show_bidder_count: true,
      show_estimated_value_on_card: true,
      show_client_identity_on_card: true,
      bid_security_required: true,
      bid_security_percentage: true,
      require_rtb_approval: true,
      instructions_to_bidders: true,
      estimation_project_id: true,
      created_at: true,
      updated_at: true,
      _count: { select: { boqChapters: true } },
    },
  });

  if (!tender) notFound();

  const deadlinePassed = tender.bid_deadline <= new Date();
  const showCloseBids = tender.status === "PUBLISHED" && deadlinePassed;
  const submittedBidCount = showCloseBids
    ? await prisma.bidSubmission.count({
        where: { tender_id: tenderId, status: { in: ["SUBMITTED"] } },
      })
    : 0;

  const statusLabel = STATUS_LABELS[tender.status] ?? tender.status;
  const statusColour = STATUS_COLOURS[tender.status] ?? "bg-gray-100 text-gray-700";

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-4">
            <Link href="/client/tenders" className="text-sm text-gray-400 hover:text-gray-700">← My tenders</Link>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusColour}`}>{statusLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            {tender.status === "PUBLISHED" && (
              <>
                <Link href={`/tenders/${tender.id}`} className="text-sm text-gray-500 hover:text-gray-900 underline">Public view</Link>
                <Link href={`/client/tenders/${tender.id}/qanda`} className="text-sm text-blue-600 hover:text-blue-700 underline">Q&amp;A</Link>
                <Link href={`/client/tenders/${tender.id}/invitations`} className="text-sm text-blue-600 hover:text-blue-700 underline">Invitations</Link>
                <Link href={`/client/tenders/${tender.id}/bids`} className="text-sm text-blue-600 hover:text-blue-700 underline">Bids</Link>
                {tender._count.boqChapters > 0 && (
                  <a href={`/api/tenders/${tender.id}/boq/export`} className="text-sm text-blue-600 hover:text-blue-700 underline">
                    Download BOQ
                  </a>
                )}
                {showCloseBids && (
                  <CloseBidsButton tenderId={tender.id} submittedBidCount={submittedBidCount} />
                )}
              </>
            )}
            {["UNDER_REVIEW", "NEGOTIATION"].includes(tender.status) && (
              <>
                <Link href={`/client/tenders/${tender.id}/bids`} className="text-sm text-blue-600 hover:text-blue-700 underline">Bids</Link>
                <Link href={`/client/tenders/${tender.id}/score`} className="text-sm text-blue-600 hover:text-blue-700 underline">Score</Link>
                <Link href={`/client/tenders/${tender.id}/negotiate`} className="text-sm text-orange-600 hover:text-orange-700 underline">Negotiate</Link>
                <Link href={`/client/tenders/${tender.id}/award`} className="text-sm text-green-700 hover:text-green-800 underline">Award</Link>
              </>
            )}
            {tender.status === "AWARDED" && (
              <>
                <Link href={`/client/tenders/${tender.id}/bids`} className="text-sm text-blue-600 hover:text-blue-700 underline">Bids</Link>
                <Link href={`/client/tenders/${tender.id}/score`} className="text-sm text-blue-600 hover:text-blue-700 underline">Score</Link>
                <Link href={`/client/tenders/${tender.id}/award`} className="text-sm text-green-700 hover:text-green-800 underline font-semibold">Awarded ✓</Link>
                <Link href={`/client/tenders/${tender.id}/contract`} className="text-sm text-indigo-600 hover:text-indigo-700 underline">Contract</Link>
              </>
            )}
            {["CONTRACT_SIGNED", "COMPLETED"].includes(tender.status) && (
              <>
                <Link href={`/client/tenders/${tender.id}/contract`} className="text-sm text-indigo-600 hover:text-indigo-700 underline">Contract</Link>
                <Link href={`/client/tenders/${tender.id}/snags`} className="text-sm text-blue-600 hover:text-blue-700 underline">Snags</Link>
                <Link href={`/client/tenders/${tender.id}/completion`} className="text-sm text-green-700 hover:text-green-800 underline">Completion</Link>
              </>
            )}
            {tender.status === "DRAFT" && (
              <PublishButton tenderId={tender.id} boqChapterCount={tender._count.boqChapters} bidDeadline={tender.bid_deadline.toISOString()} />
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-2">
          <div className="font-mono text-xs text-gray-400">{tender.reference_number}</div>
          <h1 className="text-xl font-bold text-gray-900">{tender.title}</h1>
          {tender.estimation_project_id && (
            <Link href={`/dashboard/projects/${tender.estimation_project_id}`} className="text-xs text-indigo-600 hover:underline">
              View Estimation Project
            </Link>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Description</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{tender.description}</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Details</h2>
          <InfoRow label="Type" value={tender.tender_type === "PUBLIC" ? "Public" : "Invitation only"} />
          <InfoRow label="District" value={tender.district} />
          {tender.location_detail && <InfoRow label="Location detail" value={tender.location_detail} />}
          <InfoRow label="Bid deadline" value={fmtDate(tender.bid_deadline)} />
          {tender.qanda_deadline && <InfoRow label="Q&A deadline" value={fmtDate(tender.qanda_deadline)} />}
          {tender.estimated_value != null && (
            <InfoRow label="Estimated value" value={`NPR ${Number(tender.estimated_value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} />
          )}
          <InfoRow label="BOQ chapters" value={tender._count.boqChapters} />
          <InfoRow label="Quantity visibility" value={tender.quantity_visibility === "VISIBLE" ? "Visible to contractors" : "Hidden"} />
          {tender.site_visit_required && (
            <>
              <InfoRow label="Site visit" value="Required" />
              {tender.site_visit_scheduled_at && <InfoRow label="Site visit date" value={fmtDate(tender.site_visit_scheduled_at)} />}
              {tender.site_visit_location && <InfoRow label="Site visit location" value={tender.site_visit_location} />}
            </>
          )}
          {tender.bid_security_required && (
            <InfoRow label="Bid security" value={`${Number(tender.bid_security_percentage).toFixed(2)}%`} />
          )}
          <InfoRow label="Created" value={fmtDate(tender.created_at)} />
          <InfoRow label="Last updated" value={fmtDate(tender.updated_at)} />
        </div>

        {tender.instructions_to_bidders && (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Instructions to bidders</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{tender.instructions_to_bidders}</p>
          </div>
        )}

        {tender.status === "DRAFT" && tender._count.boqChapters === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800 font-medium">BOQ required before publishing</p>
            <p className="text-xs text-amber-700 mt-1">
              This tender has no BOQ chapters yet. If you created it from an Estimation project, the BOQ should have been imported automatically. Check that the project has disciplines with groups.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
