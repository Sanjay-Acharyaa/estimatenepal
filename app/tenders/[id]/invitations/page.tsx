import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getOrCreateBidUser } from "@/lib/bid-user";
import InvitationRespond from "./invitation-respond";

type Params = { params: Promise<{ id: string }> };

export default async function ContractorInvitationPage({ params }: Params) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const procurementRoles = ((session.user as { procurementRoles?: string[] }).procurementRoles) ?? [];
  if (!procurementRoles.includes("CONTRACTOR")) redirect("/tenders");

  const bidUser = await getOrCreateBidUser(
    session.user.email as string,
    session.user.name as string,
    procurementRoles
  );

  const { id } = await params;
  const tenderId = parseInt(id, 10);
  if (isNaN(tenderId)) notFound();

  const [tender, invitation] = await Promise.all([
    prisma.tender.findFirst({
      where: { id: tenderId },
      select: { id: true, title: true, reference_number: true },
    }),
    prisma.bidTenderInvitation.findFirst({
      where: { tender_id: tenderId, contractor_user_id: bidUser.id },
      orderBy: { invited_at: "desc" },
      select: { id: true, status: true, invited_at: true, responded_at: true },
    }),
  ]);

  if (!tender) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <Link
            href={`/tenders/${tenderId}`}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ← Tender detail
          </Link>
          <h1 className="mt-1 text-lg font-bold text-gray-900">Your Invitation</h1>
          <p className="text-sm text-gray-500 truncate">{tender.title}</p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-6">
        {!invitation ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">No invitation found for this tender.</p>
            <Link
              href={`/tenders/${tenderId}`}
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              View tender →
            </Link>
          </div>
        ) : (
          <InvitationRespond
            tenderId={tenderId}
            invitation={{
              id: invitation.id,
              status: invitation.status,
              invited_at: invitation.invited_at.toISOString(),
              responded_at: invitation.responded_at?.toISOString() ?? null,
            }}
          />
        )}
      </div>
    </div>
  );
}
