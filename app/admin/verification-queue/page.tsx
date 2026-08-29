import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import VerificationQueuePanel from "./verification-queue-panel";

export interface VerificationDoc {
  id: number;
  documentType: string;
  status: string;
  fileUrl: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  org: {
    id: string;
    name: string;
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3001";
  let docs: VerificationDoc[] = [];
  let pagination: Pagination = { page, limit: 20, total: 0, pages: 1 };
  let fetchError = false;

  try {
    const res = await fetch(
      `${baseUrl}/api/admin/verification-queue?page=${page}&limit=20`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      docs = data.data;
      pagination = data.pagination;
    } else {
      fetchError = true;
    }
  } catch {
    fetchError = true;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div>
            <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">
              ← Admin
            </Link>
            <h1 className="mt-1 text-lg font-bold text-gray-900">Verification Queue</h1>
          </div>
          <span className="text-sm text-gray-500">{pagination.total} pending</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {fetchError ? (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            Failed to load verification queue. Please refresh.
          </div>
        ) : (
          <VerificationQueuePanel
            initialDocs={docs}
            pagination={pagination}
            currentPage={page}
          />
        )}
      </div>
    </div>
  );
}
