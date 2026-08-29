import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getOrCreateBidUser } from "@/lib/bid-user";
import InvitationManager from "./invitation-manager";

type Params = { params: Promise<{ id: string }> };

const STATUS_COLOURS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-600",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function ClientInvitationsPage({ params }: Params) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const procurementRoles = ((session.user as { procurementRoles?: string[] }).procurementRoles) ?? [];
  if (!procurementRoles.includes("CLIENT")) redirect("/dashboard");

  const bidUser = await getOrCreateBidUser(
    session.user.email as string,
    session.user.name as string,
    procurementRoles
  );

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) redirect("/client/tenders");

  const tender = await prisma.tender.findFirst({
    where: { id: tenderId, client_user_id: bidUser.id },
    select: { id: true, title: true, reference_number: true, status: true },
  });
  if (!tender) redirect("/client/tenders");

  const invitations = await prisma.bidTenderInvitation.findMany({
    where: { tender_id: tenderId },
    orderBy: { invited_at: "desc" },
    select: {
      id: true,
      contractor_email: true,
      contractor_user_id: true,
      status: true,
      invited_at: true,
      responded_at: true,
      contractor: { select: { full_name: true } },
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link href={`/client/tenders/${tenderId}`} className="text-xs text-gray-400 hover:text-gray-600">
            ← {tender.reference_number} — {tender.title}
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900">Invitations</h1>
            {invitations.length > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                {invitations.length}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
        {/* Send new invitation */}
        {tender.status === "PUBLISHED" && (
          <InvitationManager tenderId={tenderId} />
        )}
        {tender.status !== "PUBLISHED" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Publish the tender before inviting contractors.
          </div>
        )}

        {/* Invitations list */}
        {invitations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center">
            <p className="text-sm text-gray-400">No invitations sent yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Contractor</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Email</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Invited</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500">Responded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-800">
                      {inv.contractor?.full_name ?? (
                        <span className="italic text-gray-400">Unregistered</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{inv.contractor_email}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[inv.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{fmtDate(inv.invited_at)}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{fmtDate(inv.responded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Contractor directory link */}
        <div className="text-center">
          <Link
            href="/contractors"
            className="text-sm text-blue-600 hover:underline"
          >
            Search contractor directory to invite →
          </Link>
        </div>
      </div>
    </div>
  );
}
