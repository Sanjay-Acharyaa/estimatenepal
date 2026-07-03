"use client";

import { useState, useTransition } from "react";

type OrgRow = {
  id: string;
  name: string;
  planTier: string;
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
  status: "active" | "at_risk" | "expired" | "new" | "paid";
};

type FilterKey = "all" | "active" | "at_risk" | "expired" | "new" | "expiring7d" | "paid";

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
      {saved
        ? <span className="text-green-600 font-medium">Saved ✓</span>
        : notes
        ? <span>{notes} <span className="text-gray-300 group-hover:text-gray-400">✎</span></span>
        : <span className="text-gray-300 group-hover:text-gray-400 italic">Add note…</span>}
    </div>
  );
}

const STATUS_LABELS: Record<FilterKey, string> = {
  all: "All", active: "Active", at_risk: "At Risk",
  expired: "Expired", new: "New", expiring7d: "Expiring 7d", paid: "Paid",
};

const STATUS_COLORS = {
  active:  "bg-green-100 text-green-700",
  at_risk: "bg-red-100 text-red-700",
  expired: "bg-gray-200 text-gray-600",
  new:     "bg-blue-100 text-blue-700",
  paid:    "bg-emerald-100 text-emerald-700",
};

// ── Trial Health Table ──────────────────────────────────────────────────────
export function TrialHealthTable({
  orgAnalytics,
  activeFilter,
  onFilter,
  contactWa,
}: {
  orgAnalytics: OrgAnalytic[];
  activeFilter: FilterKey;
  onFilter: (f: FilterKey) => void;
  contactWa: string;
}) {
  const now  = Date.now();
  const in7  = now + 7 * 24 * 60 * 60 * 1000;
  const [search, setSearch] = useState("");

  const filtered = orgAnalytics.filter(item => {
    // Status filter
    let passesFilter = false;
    if (activeFilter === "all") {
      passesFilter = true;
    } else if (activeFilter === "expiring7d") {
      const t = item.org.trialEndsAt ? new Date(item.org.trialEndsAt).getTime() : null;
      passesFilter = t !== null && t > now && t <= in7;
    } else {
      passesFilter = item.status === activeFilter;
    }
    if (!passesFilter) return false;

    // Search filter
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const owner = item.org.users.find(u => u.role === "OWNER") ?? item.org.users[0];
    return (
      item.org.name.toLowerCase().includes(q) ||
      (owner?.email ?? "").toLowerCase().includes(q) ||
      (owner?.name  ?? "").toLowerCase().includes(q)
    );
  });

  function exportCsv() {
    const rows = [
      ["Org", "Plan", "Owner", "Email", "Days Left", "Status", "Score", "Projects", "Members"],
      ...filtered.map(item => {
        const owner = item.org.users.find(u => u.role === "OWNER") ?? item.org.users[0];
        return [
          item.org.name,
          item.org.planTier,
          owner?.name ?? "",
          owner?.email ?? "",
          item.daysLeft ?? "",
          item.status,
          item.activityScore,
          item.org._count.projects,
          item.org._count.users,
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `orgs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="text"
          placeholder="Search org name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64"
        />
        <button
          onClick={exportCsv}
          className="ml-auto text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition"
        >
          Export CSV
        </button>
        {activeFilter !== "all" && (
          <span className="text-xs text-gray-500">
            Filtered: <strong>{STATUS_LABELS[activeFilter]}</strong> ({filtered.length} orgs)
            {" "}
            <button onClick={() => onFilter("all")} className="text-blue-600 hover:underline">Clear</button>
          </span>
        )}
        {search && (
          <span className="text-xs text-gray-500">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            {" "}
            <button onClick={() => setSearch("")} className="text-blue-600 hover:underline">Clear</button>
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Organisation", "Plan", "Trial Ends", "Days Left", "Status", "Users", "Projects", "Last Login", "Score", "Owner Email", "Phone", "Notes"].map(h => (
                <th key={h} className="text-left px-3 py-2.5 text-gray-600 font-semibold text-xs whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(item => {
              const owner = item.org.users.find(u => u.role === "OWNER") ?? item.org.users[0];
              const daysLeftColor =
                item.daysLeft === null ? "text-gray-400"
                : item.daysLeft < 0   ? "text-gray-400 line-through"
                : item.daysLeft <= 3  ? "text-red-600 font-bold"
                : item.daysLeft <= 7  ? "text-amber-600 font-semibold"
                : "text-green-700";
              return (
                <tr key={item.org.id} className={`hover:bg-gray-50 ${item.status === "paid" ? "bg-emerald-50/40" : ""}`}>
                  <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{item.org.name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      item.org.planTier === "TRIAL" ? "bg-blue-100 text-blue-700"
                      : item.org.planTier === "FREE"  ? "bg-gray-100 text-gray-600"
                      : "bg-emerald-100 text-emerald-800 font-bold"
                    }`}>
                      {item.org.planTier}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(item.org.trialEndsAt)}</td>
                  <td className={`px-3 py-2.5 whitespace-nowrap ${daysLeftColor}`}>
                    {item.daysLeft === null ? "—" : item.daysLeft < 0 ? "Expired" : `${item.daysLeft}d`}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                      {item.status === "at_risk" ? "At Risk" : STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 text-center">{item.org._count.users}</td>
                  <td className="px-3 py-2.5 text-gray-600 text-center">{item.org._count.projects}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                    {item.lastLogin ? `${item.daysSinceLogin}d ago` : "Never"}
                  </td>
                  <td className="px-3 py-2.5"><ScoreBar score={item.activityScore} /></td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{owner?.email ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {owner?.phone ? (
                      <a href={`tel:${owner.phone}`} className="text-blue-600 hover:underline">{owner.phone}</a>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <NotesCell orgId={item.org.id} initial={item.org.adminNotes} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No organisations match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Filterable Overview Cards ───────────────────────────────────────────────
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

// ── Main Client Shell ───────────────────────────────────────────────────────
export function AnalyticsDashboardClient({
  overviewCards,
  orgAnalytics,
  atRisk,
  contactWa,
}: {
  overviewCards: { label: string; value: number; color: string; filterKey: FilterKey }[];
  orgAnalytics: OrgAnalytic[];
  atRisk: OrgAnalytic[];
  contactWa: string;
}) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  return (
    <>
      {/* Overview cards */}
      <section>
        <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">Overview</h2>
        <FilterableOverview cards={overviewCards} activeFilter={activeFilter} onFilter={setActiveFilter} />
        {activeFilter !== "all" && (
          <p className="text-xs text-gray-400 mt-2">
            Showing <strong>{STATUS_LABELS[activeFilter]}</strong> orgs in the table below.{" "}
            <button onClick={() => setActiveFilter("all")} className="text-blue-500 hover:underline">Clear filter</button>
          </p>
        )}
      </section>

      {/* Action Required */}
      {atRisk.length > 0 && activeFilter === "all" && (
        <section>
          <h2 className="text-sm font-bold text-red-600 uppercase tracking-widest mb-3">
            Action Required — Contact These Users Today ({atRisk.length})
          </h2>
          <div className="bg-white rounded-xl border border-red-200 overflow-x-auto shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-red-50 border-b border-red-100">
                <tr>
                  {["Org", "Trial Ends", "Days Left", "Last Login", "Projects", "Owner", "Phone", "Reach Out"].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-red-700 font-semibold text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-red-50">
                {atRisk.map(item => {
                  const owner = item.org.users.find(u => u.role === "OWNER") ?? item.org.users[0];
                  const waMsg = encodeURIComponent(
                    `Hi ${owner?.name ?? "there"}, your Estimate Nepal trial expires in ${item.daysLeft} day${item.daysLeft === 1 ? "" : "s"}. We noticed you haven't logged in recently — can we help you get the most out of your trial? Happy to walk you through anything.`
                  );
                  const waLink = contactWa ? `https://wa.me/${contactWa}?text=${waMsg}` : null;

                  return (
                    <tr key={item.org.id} className="hover:bg-red-50">
                      <td className="px-4 py-2.5 font-semibold text-gray-900">{item.org.name}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{fmtDate(item.org.trialEndsAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold text-white ${(item.daysLeft ?? 99) <= 3 ? "bg-red-600" : "bg-amber-500"}`}>
                          {item.daysLeft}d
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        {item.daysSinceLogin !== null ? `${item.daysSinceLogin}d ago` : "Never"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{item.org._count.projects}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-700">{owner?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs font-medium">
                        {owner?.phone ? (
                          <a href={`tel:${owner.phone}`} className="text-blue-700 hover:underline">{owner.phone}</a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1.5 flex-wrap">
                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs bg-green-500 hover:bg-green-600 text-white px-2.5 py-1 rounded-lg font-medium transition"
                            >
                              WhatsApp
                            </a>
                          )}
                          {owner?.email && (
                            <a
                              href={`mailto:${owner.email}?subject=Your Estimate Nepal trial is ending&body=Hi ${owner.name},%0A%0AYour free trial expires in ${item.daysLeft} days. We'd love to help you get the most out of it before then.%0A%0ABest,%0AEstimate Nepal Team`}
                              className="inline-flex items-center gap-1 text-xs bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1 rounded-lg font-medium transition"
                            >
                              Email
                            </a>
                          )}
                        </div>
                      </td>
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
          Trial Health &amp; Engagement — All Orgs
        </h2>
        <TrialHealthTable
          orgAnalytics={orgAnalytics}
          activeFilter={activeFilter}
          onFilter={setActiveFilter}
          contactWa={contactWa}
        />
      </section>
    </>
  );
}
