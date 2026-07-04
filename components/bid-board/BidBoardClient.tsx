"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtNPRCompact as formatNRS } from "@/lib/format";

type Project = {
  id: string;
  name: string;
  district: string | null;
  status: string;
  bidDueDate: Date | null;
  estimatedValue: number | null;
  priority: string | null;
  createdAt: Date;
  members: { userId: string; user: { id: string; name: string } }[];
};

type Column = {
  status: string;
  label: string;
  color: string;
  totalValue: number;
  projects: Project[];
};

function deadlineBadge(bidDueDate: Date | null, status: string): { label: string; cls: string } | null {
  if (!bidDueDate || status === "COMPLETE" || status === "LOST" || status === "ARCHIVED") return null;
  const now = Date.now();
  const due = new Date(bidDueDate).getTime();
  const diffMs = due - now;
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMs < 0) return { label: "Overdue", cls: "bg-red-100 text-red-700 font-semibold" };
  if (diffHrs < 24) return { label: `Due in ${diffHrs}h`, cls: "bg-red-100 text-red-700 font-semibold" };
  if (diffDays <= 7) return { label: `Due in ${diffDays}d`, cls: "bg-amber-100 text-amber-700" };
  return { label: `Due ${new Date(bidDueDate).toLocaleDateString([], { month: "short", day: "numeric" })}`, cls: "bg-gray-100 text-gray-500" };
}

const PRIORITY_BADGE: Record<string, { label: string; cls: string }> = {
  HIGH:   { label: "H", cls: "bg-red-100 text-red-700 font-bold" },
  MEDIUM: { label: "M", cls: "bg-amber-100 text-amber-700 font-bold" },
  LOW:    { label: "L", cls: "bg-gray-100 text-gray-500 font-bold" },
};

export function BidBoardClient({ grouped, isAdmin }: { grouped: Column[]; isAdmin: boolean }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const now = new Date();

  async function handleDrop(status: string) {
    if (!dragging || !isAdmin || dragging === status) return;
    setLoading(dragging);
    await fetch(`/api/projects/${dragging}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setDragging(null);
    setDragTarget(null);
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {grouped.map((col) => (
        <div
          key={col.status}
          className={`flex-shrink-0 w-64 rounded-xl transition-colors ${
            dragTarget === col.status && dragging
              ? "bg-blue-50 ring-2 ring-blue-300"
              : ""
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragTarget(col.status); }}
          onDragLeave={() => setDragTarget(null)}
          onDrop={() => handleDrop(col.status)}
        >
          {/* Column header */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className={`w-3 h-3 rounded-full ${col.color}`} />
            <span className="text-sm font-semibold text-gray-700">{col.label}</span>
            <span className="ml-auto text-xs text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
              {col.projects.length}
            </span>
          </div>

          {/* Cards */}
          <div className="space-y-3 min-h-[120px]">
            {col.projects.map((p) => {
              const isOverdue = p.bidDueDate && new Date(p.bidDueDate) < now && col.status !== "COMPLETE" && col.status !== "LOST";
              const isDueSoon = p.bidDueDate && !isOverdue &&
                new Date(p.bidDueDate).getTime() - now.getTime() < 3 * 86400000;

              return (
                <div
                  key={p.id}
                  draggable={isAdmin}
                  onDragStart={() => setDragging(p.id)}
                  onDragEnd={() => { setDragging(null); setDragTarget(null); }}
                  className={`bg-white border rounded-xl p-3 shadow-sm hover:shadow-md transition select-none ${
                    loading === p.id ? "opacity-40" : ""
                  } ${dragging === p.id ? "ring-2 ring-blue-400 opacity-70" : "border-gray-200"}`}
                >
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    onClick={(e) => dragging && e.preventDefault()}
                  >
                    {/* Priority + deadline badges */}
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      {p.priority && PRIORITY_BADGE[p.priority] && (
                        <span className={`px-1.5 py-0.5 text-[10px] rounded ${PRIORITY_BADGE[p.priority].cls}`}>
                          {PRIORITY_BADGE[p.priority].label}
                        </span>
                      )}
                      {(() => {
                        const badge = deadlineBadge(p.bidDueDate, p.status);
                        return badge ? (
                          <span className={`px-1.5 py-0.5 text-[10px] rounded ${badge.cls}`}>{badge.label}</span>
                        ) : null;
                      })()}
                    </div>

                    <h3 className="text-sm font-semibold text-gray-800 mb-0.5 line-clamp-2">{p.name}</h3>

                    {p.district && (
                      <p className="text-xs text-gray-600 mb-1.5">{p.district}</p>
                    )}

                    {/* Estimated value */}
                    {p.estimatedValue != null && p.estimatedValue > 0 && (
                      <p className="text-xs font-medium text-blue-600 mb-2">
                        {formatNRS(p.estimatedValue)}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-1">
                      <div className="flex -space-x-1">
                        {p.members.map((m) => (
                          <div
                            key={m.userId}
                            title={m.user.name}
                            className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center border-2 border-white font-medium"
                          >
                            {m.user.name.charAt(0).toUpperCase()}
                          </div>
                        ))}
                        {p.members.length === 0 && (
                          <span className="text-xs text-gray-300">No team</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-300">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                </div>
              );
            })}

            {col.projects.length === 0 && (
              <div
                className={`border-2 border-dashed rounded-xl h-20 flex items-center justify-center text-xs transition-colors ${
                  dragTarget === col.status && dragging
                    ? "border-blue-300 text-blue-400"
                    : "border-gray-200 text-gray-300"
                }`}
              >
                {isAdmin ? "Drop here" : "No projects"}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
