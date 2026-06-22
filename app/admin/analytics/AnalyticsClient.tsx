"use client";

import { useState, useTransition } from "react";

type OrgRow = {
  id: string;
  name: string;
  trialEndsAt: string | null;
  adminNotes: string | null;
  churnReason: string | null;
  _count: { users: number; projects: number };
  users: {
    id: string; name: string; email: string; phone: string | null;
    lastLoginAt: string | null; emailVerified: boolean; createdAt: string; role: string;
  }[];
};

type OrgAnalytic = {
  org: OrgRow;
  daysLeft: number | null;
  lastLogin: string | null;
  daysSinceLogin: number | null;
  activityScore: number;
  status: "active" | "at_risk" | "expired" | "new";
};

type FilterKey = "all" | "active" | "at_risk" | "expired" | "new" | "expiring7d";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NP", { day: "2-digit", month: "short", year: "numeric" });
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-500">{score}</span>
    </div>
  );
}

function NotesCell({ orgId, initial }: { orgId: string; initial: string | null }) {
  const [notes, setNotes] = useState(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  async function save() {
    startTransition(async () => {
      await fetch(`/api/admin/orgs/${orgId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  if (editing) {
    return (
      <div className="flex gap-1 items-start">
        <textarea
          className="text-xs border border-gray-300 rounded px-2 py-1 w-40 h-16 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          autoFocus
        />
        <div className="flex flex-col gap-1">
          <button onClick={save} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700">Save</button>
          <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="text-xs text-gray-500 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 max-w-[160px] truncate group"
      onClick={() => setEditing(true)}
      title={notes || "Click to add note"}
    >
      {saved ? <span className="text-green-600 font-medium">Saved ✓</span>
        : notes
        ? <span>{notes} <span className="text-gray-300 group-hover:text-gray-400">✎</span></span>
        : <span className="text-gray-300 group-hover:text-gray-400 italic">Add note…</span>
      }
    </div>
  );
}

const STATUS_LABELS: Record<FilterKey, string> = {
  all: "All",
  active: "Active",
  at_risk: "At Risk",
  expired: "Expired",
  new: "New",
  expiring7d: "Expiring 7d",
};

export function TrialHealthTable({
  orgAnalytics,
  activeFilter,
  onFilter,
}: {
  orgAnalytics: OrgAnalytic[];
  activeFilter: FilterKey;
  onFilter: (f: FilterKey) => void;
}) {
  const now = Date.now();
  const in7 = now + 7 * 24 * 60 * 60 * 1000;

  const filtered = orgAnalytics.filter(item => {
    if (activeFilter === "all") return true;
    if (activeFilter === "expiring7d") {
      const t = item.org.trialEndsAt ? new Date(item.org.trialEndsAt).getTime() : null;
      return t !== null && t > now && t <= in7;
    }
    return item.status === activeFilter;
  });

  const statusColors = {
    active: "bg-green-100 text-green-700",
    at_risk: "bg-red-100 text-red-700",
    expired: "bg-gray-200 text-gray-600",
    new: "bg-blue-100 text-blue-700",
  };

  return (
    <>
      {activeFilter !== "all" && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-500">Filtered: <strong>{STATUS_LABELS[activeFilter]}</strong> ({filtered.length} orgs)</span>
          <button onClick={() => onFilter("all")} className="text-xs text-blue-600 hover:underline">Clear filter</button>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Organisation", "Trial Ends", "Days Left", "Status", "Users", "Projects", "Last Login", "Score", "Phone", "Owner Email", "Notes"].map(h => (
                <th key={h} className="text-left px-3 py-2.5 text-gray-600 font-semibold text-xs whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(item => {
              const owner = item.org.users.find(u => u.role === "OWNER") ?? item.org.users[0];
              const daysLeftColors =
                item.daysLeft === null ? "text-gray-400"
                : item.daysLeft < 0 ? "text-gray-400 line-through"
                : item.daysLeft <= 3 ? "text-red-600 font-bold"
                : item.daysLeft <= 7 ? "text-amber-600 font-semibold"
                : "text-green-700";
              return (
                <tr key={item.org.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{item.org.name}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(item.org.trialEndsAt)}</td>
                  <td className={`px-3 py-2.5 whitespace-nowrap ${daysLeftColors}`}>
                    {item.daysLeft === null ? "—" : item.daysLeft < 0 ? "Expired" : `${item.daysLeft}d`}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
                      {item.status === "at_risk" ? "At Risk" : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 text-center">{item.org._count.users}</td>
                  <td className="px-3 py-2.5 text-gray-600 text-center">{item.org._count.projects}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                    {item.lastLogin ? `${item.daysSinceLogin}d ago` : "Never"}
                  </td>
                  <td className="px-3 py-2.5"><ScoreBar score={item.activityScore} /></td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {owner?.phone ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{owner?.email ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <NotesCell orgId={item.org.id} initial={item.org.adminNotes} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-400 text-sm">No organisations match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function FilterableOverview({
  cards,
  activeFilter,
  onFilter,
}: {
  cards: { label: string; value: number; color: string; filterKey: FilterKey }[];
  activeFilter: FilterKey;
  onFilter: (f: FilterKey) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {cards.map(card => (
        <button
          key={card.label}
          onClick={() => onFilter(activeFilter === card.filterKey ? "all" : card.filterKey)}
          className={`rounded-xl border p-4 text-center transition-all ${card.color} ${
            activeFilter === card.filterKey
              ? "ring-2 ring-offset-1 ring-blue-500 scale-105 shadow-md"
              : "hover:scale-105 hover:shadow-sm"
          }`}
        >
          <div className="text-3xl font-extrabold">{card.value}</div>
          <div className="text-xs font-medium mt-1 opacity-80">{card.label}</div>
          {card.filterKey !== "all" && (
            <div className="text-xs mt-1 opacity-50">{activeFilter === card.filterKey ? "✓ filtered" : "click to filter"}</div>
          )}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsDashboardClient({
  overviewCards,
  orgAnalytics,
  atRisk,
}: {
  overviewCards: { label: string; value: number; color: string; filterKey: FilterKey }[];
  orgAnalytics: OrgAnalytic[];
  atRisk: OrgAnalytic[];
}) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  return (
    <>
      {/* Overview cards */}
      <section>
        <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">Overview</h2>
        <FilterableOverview cards={overviewCards} activeFilter={activeFilter} onFilter={setActiveFilter} />
        {activeFilter !== "all" && (
          <p className="text-xs text-gray-400 mt-2">Showing <strong>{STATUS_LABELS[activeFilter]}</strong> orgs in the table below. Click the card again or <button onClick={() => setActiveFilter("all")} className="text-blue-500 hover:underline">clear filter</button>.</p>
        )}
      </section>

      {/* Action required */}
      {atRisk.length > 0 && activeFilter === "all" && (
        <section>
          <h2 className="text-sm font-bold text-red-600 uppercase tracking-widest mb-3">
            🚨 Action Required — Contact These Users Today
          </h2>
          <div className="bg-white rounded-xl border border-red-200 overflow-x-auto shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-red-50 border-b border-red-100">
                <tr>
                  {["Org", "Trial Ends", "Days Left", "Last Login", "Projects", "Phone", "Contact"].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-red-700 font-semibold text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-red-50">
                {atRisk.map(item => {
                  const owner = item.org.users.find(u => u.role === "OWNER") ?? item.org.users[0];
                  return (
                    <tr key={item.org.id} className="hover:bg-red-50">
                      <td className="px-4 py-2.5 font-semibold text-gray-900">{item.org.name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{fmtDate(item.org.trialEndsAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${(item.daysLeft ?? 99) <= 3 ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
                          {item.daysLeft} days
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{item.daysSinceLogin !== null ? `${item.daysSinceLogin}d ago` : "Never"}</td>
                      <td className="px-4 py-2.5 text-gray-600">{item.org._count.projects}</td>
                      <td className="px-4 py-2.5 text-xs font-medium text-blue-700">
                        {owner?.phone
                          ? <a href={`tel:${owner.phone}`} className="hover:underline">{owner.phone}</a>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{owner?.email ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Trial health table */}
      <section>
        <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">
          Trial Health &amp; Engagement (All Orgs)
        </h2>
        <TrialHealthTable orgAnalytics={orgAnalytics} activeFilter={activeFilter} onFilter={setActiveFilter} />
      </section>
    </>
  );
}
