import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateBidUser } from "@/lib/bid-user";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtNPR(val: unknown): string {
  if (val == null) return "—";
  return `NPR ${Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const STATUS_COLOURS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  SHORTLISTED: "bg-yellow-100 text-yellow-800",
  AWARDED: "bg-green-100 text-green-700",
  NOT_AWARDED: "bg-red-100 text-red-700",
  REJECTED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-orange-100 text-orange-700",
};

export default async function ContractorBidsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const procurementRoles = ((session.user as { procurementRoles?: string[] }).procurementRoles) ?? [];
  if (!procurementRoles.includes("CONTRACTOR")) redirect("/tenders");

  const bidUser = await getOrCreateBidUser(
    session.user.email as string,
    session.user.name as string,
    procurementRoles
  );

  const bids = await prisma.bidSubmission.findMany({
    where: { bidder_user_id: bidUser.id },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      status: true,
      version: true,
      grand_total_npr: true,
      total_with_vat_npr: true,
      submitted_at: true,
      created_at: true,
      tender: {
        select: {
          id: true,
          reference_number: true,
          title: true,
          district: true,
          bid_deadline: true,
          status: true,
        },
      },
    },
  });

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold text-gray-900">EstimateNepal</Link>
            <h1 className="text-sm font-medium text-gray-500">My Bids</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/portfolio" className="text-sm text-gray-600 hover:text-gray-900">Portfolio</Link>
            <Link href="/tenders" className="text-sm text-gray-600 hover:text-gray-900">Open Tenders</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {bids.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="text-sm text-gray-500 mb-4">You haven&apos;t started any bids yet.</p>
            <Link
              href="/tenders"
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Browse open tenders
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Tender</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">District</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Deadline</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="py-3 px-4 text-right text-xs font-medium text-gray-500">Total (with VAT)</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Submitted</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bids.map((bid) => (
                  <tr key={bid.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs text-gray-400">{bid.tender.reference_number}</div>
                      <div className="text-sm font-medium text-gray-900 max-w-xs truncate">{bid.tender.title}</div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{bid.tender.district}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{fmtDate(bid.tender.bid_deadline)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[bid.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {bid.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-sm text-gray-700">
                      {fmtNPR(bid.total_with_vat_npr)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{fmtDate(bid.submitted_at)}</td>
                    <td className="py-3 px-4 text-right">
                      {(bid.status === "DRAFT" || bid.status === "SUBMITTED") && bid.tender.status === "PUBLISHED" ? (
                        <Link
                          href={`/tenders/${bid.tender.id}/bids/${bid.id}`}
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          {bid.status === "DRAFT" ? "Continue →" : "View →"}
                        </Link>
                      ) : (
                        <Link
                          href={`/tenders/${bid.tender.id}`}
                          className="text-xs text-gray-400 hover:underline"
                        >
                          Tender →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
