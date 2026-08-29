import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import TenderFilterBar from "./TenderFilterBar";
import { DeadlineUrgencyChip } from "@/components/ui/DeadlineUrgencyChip";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtNPR(val: unknown): string {
  if (val == null) return "—";
  return `NPR ${Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

interface SearchParams {
  q?: string;
  district?: string;
  tender_type?: string;
  min_value?: string;
  deadline_before?: string;
  page?: string;
}

async function TendersList({ searchParams }: { searchParams: SearchParams }) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const limit = 12;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    status: "PUBLISHED",
    bid_deadline: { gt: new Date() },
  };

  if (searchParams.q) {
    where.OR = [
      { title: { contains: searchParams.q } },
      { reference_number: { contains: searchParams.q } },
    ];
  }
  if (searchParams.district) {
    where.district = { contains: searchParams.district };
  }
  if (searchParams.tender_type === "PUBLIC" || searchParams.tender_type === "INVITATION_ONLY") {
    where.tender_type = searchParams.tender_type;
  }
  if (searchParams.min_value && !isNaN(Number(searchParams.min_value))) {
    where.estimated_value = { gte: Number(searchParams.min_value) };
  }
  if (searchParams.deadline_before) {
    const d = new Date(searchParams.deadline_before);
    if (!isNaN(d.getTime())) {
      const existing = (where.bid_deadline as Record<string, unknown>) ?? { gt: new Date() };
      where.bid_deadline = { ...existing, lte: d };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = where as any;
  const [tenders, total] = await Promise.all([
    prisma.tender.findMany({
      where: w,
      orderBy: { bid_deadline: "asc" },
      skip,
      take: limit,
      select: {
        id: true,
        reference_number: true,
        title: true,
        district: true,
        tender_type: true,
        bid_deadline: true,
        estimated_value: true,
        show_estimated_value_on_card: true,
        site_visit_required: true,
        client: { select: { full_name: true } },
      },
    }),
    prisma.tender.count({ where: w }),
  ]);

  const totalPages = Math.ceil(total / limit);

  if (tenders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
        <p className="text-sm text-gray-500">No open tenders match your filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{total} tender{total !== 1 ? "s" : ""} found</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tenders.map((t) => (
          <Link
            key={t.id}
            href={`/tenders/${t.id}`}
            className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="font-mono text-xs text-gray-400">{t.reference_number}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${t.tender_type === "PUBLIC" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                  {t.tender_type === "PUBLIC" ? "Public" : "Invitation"}
                </span>
              </div>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 flex-1 mb-3">
              {t.title}
            </h3>
            <div className="space-y-1 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {t.district}
              </div>
              {t.show_estimated_value_on_card && t.estimated_value != null && (
                <div className="flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {fmtNPR(t.estimated_value)}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <DeadlineUrgencyChip deadline={t.bid_deadline} />
              <span className="text-xs text-gray-400">{fmtDate(t.bid_deadline)}</span>
            </div>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {page > 1 && (
            <Link
              href={`/tenders?${new URLSearchParams({ ...searchParams, page: String(page - 1) }).toString()}`}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link
              href={`/tenders?${new URLSearchParams({ ...searchParams, page: String(page + 1) }).toString()}`}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default async function TendersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold text-gray-900">EstimateNepal</Link>
            <h1 className="text-sm font-medium text-gray-500">Open Tenders</h1>
          </div>
          <div className="flex items-center gap-4">
            {session?.user ? (
              <>
                <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</Link>
                {(session.user as any).procurementRoles?.includes("CLIENT") && (
                  <Link
                    href="/client/tenders"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    My Tenders
                  </Link>
                )}
                {(session.user as any).procurementRoles?.includes("CONTRACTOR") && (
                  <Link
                    href="/contractor/bids"
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                  >
                    My Bids
                  </Link>
                )}
              </>
            ) : (
              <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        <Suspense>
          <TenderFilterBar />
        </Suspense>
        <Suspense fallback={<div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-gray-200 animate-pulse" />)}</div>}>
          <TendersList searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
