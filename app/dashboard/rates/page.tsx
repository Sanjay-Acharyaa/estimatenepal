import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RateCatalog } from "@/components/rates/RateCatalog";

export default async function RatesPage() {
  const session = await getSession();
  if (!session?.user) redirect("/");

  const isAdmin = ["OWNER", "ADMIN"].includes(session.user.role ?? "");

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rate Catalog</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage custom rates for your organisation. Assign rates to BOQ groups to calculate amounts.
          {!isAdmin && " Contact an Admin to add or edit rates."}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <RateCatalog isAdmin={isAdmin} />
      </div>
    </div>
  );
}
