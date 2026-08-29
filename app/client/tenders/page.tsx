import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateBidUser } from "@/lib/bid-user";
import TendersTable, { TenderRow } from "./TendersTable";

export default async function ClientTendersPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const procurementRoles = ((session.user as any).procurementRoles as string[] | undefined) ?? [];
  if (!procurementRoles.includes("CLIENT")) redirect("/dashboard");

  const bidUser = await getOrCreateBidUser(
    session.user.email!,
    session.user.name!,
    procurementRoles
  );

  const tenders = await prisma.tender.findMany({
    where: { client_user_id: bidUser.id },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      reference_number: true,
      title: true,
      district: true,
      tender_type: true,
      status: true,
      bid_deadline: true,
    },
  });

  const rows: TenderRow[] = tenders.map((t) => ({
    id: t.id,
    title: t.title,
    reference_number: t.reference_number,
    status: t.status,
    tender_type: t.tender_type,
    bid_deadline: t.bid_deadline.toISOString(),
    district: t.district,
  }));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold text-gray-900">My Tenders</h1>
            <Link href="/tenders" className="text-sm text-gray-500 hover:text-gray-900">Open Tenders</Link>
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/client/tenders/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Create tender
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8 space-y-5">
        {/* Stat tile */}
        <div className="max-w-xs">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
            <p className="mt-1 text-xs text-gray-500">Total Tenders</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="text-sm text-gray-500">No tenders yet.</p>
            <Link
              href="/client/tenders/new"
              className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Create your first tender
            </Link>
          </div>
        ) : (
          <TendersTable tenders={rows} />
        )}
      </div>
    </main>
  );
}
