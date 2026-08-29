import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import ContractorsPanel from "./contractors-panel";

type SearchParams = { searchParams: Promise<Record<string, string | undefined>> };

function buildQuery(
  base: Record<string, string | undefined>,
  overrides: Record<string, string | number | undefined> = {}
): string {
  const merged = { ...base, ...overrides };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export default async function ContractorDirectoryPage({ searchParams }: SearchParams) {
  const session = await getSession();
  const sp = await searchParams;

  const q = sp.q?.trim() || undefined;
  const accountType = sp.account_type || undefined;
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const limit = 12;
  const skip = (pageNum - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { role: "CONTRACTOR", status: "ACTIVE" };
  if (q) where.full_name = { contains: q };
  if (accountType === "INDIVIDUAL" || accountType === "COMPANY") {
    where.account_type = accountType;
  }

  const [contractors, total] = await Promise.all([
    prisma.bidUser.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        full_name: true,
        account_type: true,
        status: true,
        organization: {
          select: { name: true, district: true, verified: true, class: true },
        },
      },
    }),
    prisma.bidUser.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);
  const hasFilters = !!(q || accountType);

  const procurementRoles = ((session?.user as { procurementRoles?: string[] })?.procurementRoles) ?? [];
  const isClient = procurementRoles.includes("CLIENT");

  let publishedTenders: { id: number; title: string }[] = [];
  if (isClient && session?.user) {
    const { getOrCreateBidUser } = await import("@/lib/bid-user");
    const bidUser = await getOrCreateBidUser(
      session.user.email as string,
      session.user.name as string,
      procurementRoles
    );
    publishedTenders = await prisma.tender.findMany({
      where: { client_user_id: bidUser.id, status: "PUBLISHED" },
      select: { id: true, title: true },
      orderBy: { created_at: "desc" },
    });
  }

  const filterParams: Record<string, string | undefined> = { q, account_type: accountType };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold text-gray-900">EstimateNepal</Link>
            <h1 className="text-sm font-medium text-gray-500">Contractor Directory</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {session?.user ? (
              <>
                {isClient && (
                  <Link href="/client/tenders" className="text-blue-600 hover:underline">My tenders →</Link>
                )}
                {procurementRoles.includes("CONTRACTOR") && (
                  <Link href="/contractor/bids" className="text-blue-600 hover:underline">My bids →</Link>
                )}
              </>
            ) : (
              <Link href="/login" className="text-gray-600 hover:text-gray-900">Sign in</Link>
            )}
            <Link href="/tenders" className="text-gray-500 hover:underline">Open tenders →</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <form method="GET" className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">Search by name</label>
              <input
                type="text"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Contractor name…"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="min-w-[140px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                name="account_type"
                defaultValue={accountType ?? ""}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All types</option>
                <option value="INDIVIDUAL">Individual</option>
                <option value="COMPANY">Company</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700 transition-colors"
              >
                Search
              </button>
              {hasFilters && (
                <Link
                  href="/contractors"
                  className="text-sm text-gray-500 hover:text-gray-800 px-4 py-2 border border-gray-300 rounded"
                >
                  Clear
                </Link>
              )}
            </div>
          </div>
        </form>

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {total} contractor{total !== 1 ? "s" : ""} found
          </p>
          {isClient && publishedTenders.length === 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded">
              Publish a tender to invite contractors.
            </p>
          )}
        </div>

        <ContractorsPanel
          contractors={contractors}
          publishedTenders={publishedTenders}
          isClient={isClient}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8 text-sm">
            {pageNum > 1 ? (
              <Link
                href={`/contractors${buildQuery(filterParams, { page: pageNum - 1 })}`}
                className="text-blue-600 hover:underline"
              >
                ← Previous
              </Link>
            ) : (
              <span className="text-gray-300 pointer-events-none">← Previous</span>
            )}
            <span className="text-gray-500">Page {pageNum} of {totalPages}</span>
            {pageNum < totalPages ? (
              <Link
                href={`/contractors${buildQuery(filterParams, { page: pageNum + 1 })}`}
                className="text-blue-600 hover:underline"
              >
                Next →
              </Link>
            ) : (
              <span className="text-gray-300 pointer-events-none">Next →</span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
