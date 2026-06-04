"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { BOQTable } from "@/components/boq/BOQTable";
import { OverrideList } from "@/components/boq/OverrideList";
import { ExportButtons } from "@/components/boq/ExportButtons";

type Tab = "boq" | "overrides" | "export";

interface ProjectBasic {
  id: string;
  name: string;
  district: string | null;
  vatEnabled: boolean;
  vatRate: number;
}

export default function BOQPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<Tab>("boq");
  const [project, setProject] = useState<ProjectBasic | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) setProject(data);
      })
      .catch(() => {});
  }, [params.id]);

  // Fetch pending override count for badge
  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/projects/${params.id}/boq/overrides?status=PENDING&limit=1`)
      .then((r) => r.json())
      .then((data) => setPendingCount(data?.pagination?.total ?? 0))
      .catch(() => {});
  }, [params.id]);

  if (status === "loading" || !session) {
    return <div className="p-8 text-gray-400 text-sm">Loading…</div>;
  }

  const isAdmin = ["OWNER", "ADMIN"].includes(session.user.role ?? "");
  const projectId = params.id;

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "boq", label: "BOQ" },
    { key: "overrides", label: "Overrides", badge: pendingCount > 0 ? pendingCount : undefined },
    { key: "export", label: "Export" },
  ];

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/projects" className="hover:text-gray-700">Projects</Link>
        <span>›</span>
        {project ? (
          <Link href={`/dashboard/projects/${projectId}`} className="hover:text-gray-700">
            {project.name}
          </Link>
        ) : (
          <Link href={`/dashboard/projects/${projectId}`} className="hover:text-gray-700">Project</Link>
        )}
        <span>›</span>
        <span className="text-gray-800 font-medium">BOQ</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Bill of Quantities
          {project && <span className="text-gray-500 font-normal text-xl ml-2">— {project.name}</span>}
        </h1>
        {project?.district && (
          <p className="text-sm text-gray-400 mt-1">District: {project.district}</p>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === key
                ? "bg-white border border-b-white border-gray-200 -mb-px text-blue-700"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {label}
            {badge !== undefined && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] inline-block text-center">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {tab === "boq" && (
          <div>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">Quantity Schedule</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Click a group row to expand measurement details. Yellow cells have approved rate overrides.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {project?.vatEnabled && (
                  <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded">
                    VAT {project.vatRate}% included
                  </span>
                )}
                <button
                  onClick={() => setTab("export")}
                  className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Export ↗
                </button>
              </div>
            </div>
            <div className="p-0">
              <BOQTable projectId={projectId} isAdmin={isAdmin} />
            </div>
          </div>
        )}

        {tab === "overrides" && (
          <div className="p-6">
            <div className="mb-4">
              <h2 className="font-semibold text-gray-800">Rate Overrides</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isAdmin
                  ? "Review and approve or reject proposed rate changes."
                  : "Propose rate changes for Admin review. Overrides take effect once approved."}
              </p>
            </div>
            <OverrideList projectId={projectId} isAdmin={isAdmin} />
          </div>
        )}

        {tab === "export" && (
          <div className="p-6">
            <div className="mb-5">
              <h2 className="font-semibold text-gray-800">Export BOQ</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Download the Bill of Quantities in standard Nepal formats.
              </p>
            </div>
            <ExportButtons projectId={projectId} />
          </div>
        )}
      </div>
    </div>
  );
}
