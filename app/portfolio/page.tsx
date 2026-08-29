import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getOrCreateBidUser } from "@/lib/bid-user";
import { prisma } from "@/lib/prisma";
import PortfolioPanel from "./portfolio-panel";

export default async function PortfolioPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const procurementRoles =
    ((session.user as { procurementRoles?: string[] }).procurementRoles) ?? [];
  if (!procurementRoles.includes("CONTRACTOR")) redirect("/dashboard");

  const bidUser = await getOrCreateBidUser(
    session.user.email as string,
    session.user.name as string,
    procurementRoles
  );

  const projects = await prisma.bidPortfolioProject.findMany({
    where: { user_id: bidUser.id },
    orderBy: { year_of_completion: "desc" },
    select: {
      id: true,
      project_name: true,
      client_type: true,
      contract_value_range: true,
      year_of_completion: true,
      role: true,
      description: true,
      source: true,
      related_tender_id: true,
      created_at: true,
    },
  });

  const serialized = projects.map((p) => ({
    ...p,
    created_at: p.created_at.toISOString(),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <Link href="/contractor/bids" className="hover:text-gray-600">← My Bids</Link>
            </div>
            <h1 className="mt-1 text-lg font-bold text-gray-900">Portfolio</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Showcase your past projects to clients browsing the contractor directory.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        <PortfolioPanel initialProjects={serialized} />
      </div>
    </div>
  );
}
