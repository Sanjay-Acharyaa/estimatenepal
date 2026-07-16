"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { TEMPLATE_LABELS, TEMPLATE_TYPES, TEMPLATE_VARS, TemplateType, wrapEmailHtml } from "@/lib/email-template-constants";

// ── Types ────────────────────────────────────────────────────────────────────

type Stats = {
  monthCount: number;
  totalCount: number;
  topChurnReason: string | null;
  conversionRate: number;
  activeTrials: number;
  expiredTrials: number;
  unsubscribedCount: number; // L3
};

type EmailLog = {
  id: string;
  orgName: string | null;
  recipientEmail: string;
  recipientName: string;
  emailType: string;
  subject: string;
  status: string;
  sentAt: string;
};

type ChurnRow = {
  orgId: string;
  orgName: string;
  ownerEmail: string | null;
  ownerName: string | null;
  churnReason: string | null;
  trialEndsAt: string | null;
  lastLoginAt: string | null;
  projectCount: number;
  dataWipedAt: string | null;
  daysTrialUsed: number | null;
};

type Template = {
  emailType: string;
  subject: string;
  bodyHtml: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isCustom: boolean;
};

type TemplateVersion = {
  id: string;
  emailType: string;
  subject: string;
  bodyHtml: string;
  savedAt: string;
  savedBy: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100; // M2: server-side pagination

const CHURN_REASON_LABELS: Record<string, string> = {
  too_expensive:    "Too expensive",
  missing_features: "Missing features",
  just_exploring:   "Just exploring",
  competitor:       "Went with a competitor",
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

// M6: Badge colors include churn_reason and nps (C2 added them to TEMPLATE_TYPES)
const TYPE_BADGE_COLORS: Record<string, string> = {
  welcome:           "bg-blue-100 text-blue-700",
  trial_day7:        "bg-indigo-100 text-indigo-700",
  trial_day12:       "bg-orange-100 text-orange-700",
  trial_reminder_3d: "bg-amber-100 text-amber-700",
  trial_expired:     "bg-red-100 text-red-700",
  reengagement_7:    "bg-purple-100 text-purple-700",
  reengagement_14:   "bg-violet-100 text-violet-700",
  reengagement_21:   "bg-pink-100 text-pink-700",
  data_warning:      "bg-rose-100 text-rose-700",
  data_wiped:        "bg-gray-200 text-gray-600",
  churn_reason:      "bg-yellow-100 text-yellow-700",
  nps:               "bg-teal-100 text-teal-700",
};

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AdminEmailsPage() {
  const [tab, setTab] = useState<"activity" | "churn" | "templates">("activity");

  // Activity
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsOffset, setLogsOffset] = useState(0);      // M2: current pagination offset
  const [logsTotal, setLogsTotal] = useState(0);        // M2: total count from server
  const [loadingMore, setLoadingMore] = useState(false); // M2

  // Activity filters
  const [filterType, setFilterType] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Churn
  const [churnRows, setChurnRows] = useState<ChurnRow[]>([]);
  const [churnLoading, setChurnLoading] = useState(false);
  const [churnLoaded, setChurnLoaded] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplLoaded, setTplLoaded] = useState(false);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");        // L5: separate from restoreMsg
  const [restoreMsg, setRestoreMsg] = useState("");  // L5: restore confirmation message
  const [previewHtml, setPreviewHtml] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  // M5: Version history
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const versionsCache = useRef<Map<string, TemplateVersion[]>>(new Map()); // M6: cache by type

  // L5: Test send to admin
  const [testSending, setTestSending] = useState(false);
  const [testSendMsg, setTestSendMsg] = useState("");

  // Manual send
  const [sendUserEmail, setSendUserEmail] = useState("");
  const [sendType, setSendType] = useState<TemplateType>("welcome");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState("");

  // M2: Build query params from filters
  const buildLogUrl = useCallback((offset: number) => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (filterType) p.set("emailType", filterType);
    return `/api/admin/emails?${p}`;
  }, [filterType]);

  // Load activity on mount and filter change
  useEffect(() => {
    setLogsLoading(true);
    setLogsOffset(0);
    setLogs([]);
    fetch(buildLogUrl(0))
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats);
        setLogs(data.logs);
        // M3: Use filteredCount for pagination (type-scoped); stats.totalCount is always global.
        setLogsTotal(data.filteredCount ?? data.stats.totalCount);
      })
      .finally(() => setLogsLoading(false));
  }, [buildLogUrl]);

  // M2: Load more
  const loadMore = () => {
    const newOffset = logsOffset + PAGE_SIZE;
    setLoadingMore(true);
    fetch(buildLogUrl(newOffset))
      .then((r) => r.json())
      .then((data) => {
        setLogs((prev) => [...prev, ...data.logs]);
        setLogsOffset(newOffset);
      })
      .finally(() => setLoadingMore(false));
  };

  // Load churn tab on first open
  useEffect(() => {
    if (tab === "churn" && !churnLoaded) {
      setChurnLoading(true);
      fetch("/api/admin/emails/churn")
        .then((r) => r.json())
        .then((data) => { setChurnRows(data); setChurnLoaded(true); })
        .finally(() => setChurnLoading(false));
    }
  }, [tab, churnLoaded]);

  // Load templates tab on first open
  useEffect(() => {
    if (tab === "templates" && !tplLoaded) {
      setTplLoading(true);
      fetch("/api/admin/emails/templates")
        .then((r) => r.json())
        .then((data) => { setTemplates(data); setTplLoaded(true); })
        .finally(() => setTplLoading(false));
    }
  }, [tab, tplLoaded]);

  // Client-side search + date filter (type filter is server-side)
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (filterFrom && new Date(l.sentAt) < new Date(filterFrom)) return false;
      if (filterTo) {
        const to = new Date(filterTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(l.sentAt) > to) return false;
      }
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const hit =
          (l.orgName ?? "").toLowerCase().includes(q) ||
          l.recipientEmail.toLowerCase().includes(q) ||
          l.recipientName.toLowerCase().includes(q) ||
          l.subject.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [logs, filterSearch, filterFrom, filterTo]);

  // Open template for editing
  const openEdit = useCallback(
    (type: string) => {
      const tpl = templates.find((t) => t.emailType === type);
      if (!tpl) return;
      setEditingType(type);
      setEditSubject(tpl.subject);
      setEditBody(tpl.bodyHtml);
      setShowPreview(false);
      setShowVersions(false);
      setSaveMsg("");
      setRestoreMsg("");
      setTestSendMsg("");
    },
    [templates]
  );

  const saveTemplate = async () => {
    if (!editingType) return;
    setSavingTpl(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/admin/emails/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailType: editingType, subject: editSubject, bodyHtml: editBody }),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json();
      setTemplates((prev) =>
        prev.map((t) =>
          t.emailType === editingType
            ? { ...t, subject: updated.subject, bodyHtml: updated.bodyHtml, updatedAt: updated.updatedAt, updatedBy: updated.updatedBy, isCustom: true }
            : t
        )
      );
      setSaveMsg("Saved successfully.");
      // M6: Invalidate cache and refresh history panel after save
      versionsCache.current.delete(editingType);
      if (showVersions) loadVersions(editingType, true);
    } catch {
      setSaveMsg("Save failed. Please try again.");
    } finally {
      setSavingTpl(false);
    }
  };

  const previewTemplate = () => {
    const populated = editBody
      .replaceAll("{{name}}", "Ram Prasad")
      .replaceAll("{{dashboardUrl}}", "#")
      .replaceAll("{{upgradeUrl}}", "#")
      .replaceAll("{{baseUrl}}", "https://estimatenepal.com")
      .replaceAll("{{trialEndsAt}}", new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))
      .replaceAll("{{reasonButtons}}", "<p style='color:#94a3b8;text-align:center'>[Reason buttons rendered at send time]</p>")
      .replaceAll("{{scoreButtons}}", "<p style='color:#94a3b8;text-align:center'>[NPS score buttons rendered at send time]</p>");
    setPreviewHtml(wrapEmailHtml(populated));
    setShowPreview(true);
    setShowVersions(false);
  };

  // M5/M6: Load version history — uses in-memory cache to avoid refetching on panel re-open.
  const loadVersions = async (type: string, force = false) => {
    if (!force && versionsCache.current.has(type)) {
      setVersions(versionsCache.current.get(type)!);
      return;
    }
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/admin/emails/templates/versions?emailType=${type}`);
      const data = await res.json();
      versionsCache.current.set(type, data);
      setVersions(data);
    } finally {
      setVersionsLoading(false);
    }
  };

  const openVersions = () => {
    if (!editingType) return;
    setShowVersions(true);
    setShowPreview(false);
    loadVersions(editingType); // M6: uses cache — no refetch if already loaded for this type
  };

  const restoreVersion = (v: TemplateVersion) => {
    const ok = window.confirm(`Restore version from ${fmtTime(v.savedAt)}? This will overwrite the editor — don't forget to save.`);
    if (!ok) return;
    setEditSubject(v.subject);
    setEditBody(v.bodyHtml);
    setShowVersions(false);
    // L5: Use restoreMsg (separate from saveMsg) so they don't overwrite each other
    setRestoreMsg("Version restored into editor — click Save to apply.");
    setSaveMsg("");
  };

  // L5: Send test email to admin
  const sendTestEmail = async () => {
    if (!editingType) return;
    setTestSending(true);
    setTestSendMsg("");
    try {
      const res = await fetch("/api/admin/emails/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailType: editingType, subject: editSubject, bodyHtml: editBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setTestSendMsg(`Test sent to ${data.to}`);
    } catch (e) {
      setTestSendMsg((e as Error).message);
    } finally {
      setTestSending(false);
    }
  };

  // Manual send
  const sendManual = async () => {
    const email = sendUserEmail.trim();
    if (!email) { setSendMsg("Enter a user email address."); return; }
    if (!email.includes("@")) { setSendMsg("Enter a valid email address."); return; }

    const ok = window.confirm(`Send "${TEMPLATE_LABELS[sendType]}" email to ${email}?`);
    if (!ok) return;

    setSending(true);
    setSendMsg("");
    try {
      const res = await fetch("/api/admin/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: email, emailType: sendType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSendMsg(`Sent to ${data.sentTo}`);
      setSendUserEmail("");
    } catch (e) {
      setSendMsg((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100">

      {/* Header */}
      <div className="bg-indigo-700 text-white px-8 py-4 flex items-center gap-4">
        <a href="/admin" className="text-indigo-200 text-sm hover:text-white">← Admin</a>
        <span className="font-bold text-lg">Email Dashboard</span>
        <span className="text-indigo-300 text-sm">Activity · Churn · Templates</span>
        <div className="ml-auto flex gap-2">
          <a href="/api/admin/emails/export?type=activity" className="text-sm bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-md font-medium">
            Export Activity CSV
          </a>
          <a href="/api/admin/emails/export?type=churn" className="text-sm bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-md font-medium">
            Export Churn CSV
          </a>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Stats strip — L3: now includes unsubscribed count */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {[
              { label: "Emails this month",  value: stats.monthCount },
              { label: "Total emails sent",  value: stats.totalCount },
              { label: "Active trials",      value: stats.activeTrials,      color: "text-green-600" },
              { label: "Expired trials",     value: stats.expiredTrials,     color: "text-red-600" },
              { label: "Conversion rate",    value: `${stats.conversionRate}%`, color: "text-indigo-600" },
              { label: "Unsubscribed users", value: stats.unsubscribedCount, color: "text-orange-500" },
              {
                label: "Top churn reason",
                value: stats.topChurnReason ? (CHURN_REASON_LABELS[stats.topChurnReason] ?? stats.topChurnReason) : "—",
                small: true,
              },
            ].map((k) => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
                <div className={`text-xl font-extrabold ${(k as { color?: string }).color ?? "text-gray-900"} ${(k as { small?: boolean }).small ? "text-sm font-bold" : ""}`}>
                  {k.value}
                </div>
                <div className="text-xs text-gray-500 mt-1">{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Manual send */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">Manual Send</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">User Email</label>
              <input
                type="email"
                value={sendUserEmail}
                onChange={(e) => setSendUserEmail(e.target.value)}
                placeholder="user@example.com"
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email Type</label>
              <select
                value={sendType}
                onChange={(e) => setSendType(e.target.value as TemplateType)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {/* M5: Exclude churn_reason and nps — they need HMAC-signed survey URLs
                    generated at cron time. Manual send would show broken placeholder buttons. */}
                {TEMPLATE_TYPES.filter((t) => t !== "churn_reason" && t !== "nps").map((t) => (
                  <option key={t} value={t}>{TEMPLATE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <button
              onClick={sendManual}
              disabled={sending}
              className="bg-indigo-600 text-white text-sm px-4 py-1.5 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send Now"}
            </button>
            {sendMsg && <span className={`text-sm ${sendMsg.startsWith("Sent") ? "text-green-600" : "text-red-600"}`}>{sendMsg}</span>}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200">
            {(["activity", "churn", "templates"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-6 py-3 text-sm font-medium capitalize transition-colors ${
                  tab === t
                    ? "border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {t === "activity" ? "Email Activity" : t === "churn" ? "Churn Feedback" : "Email Templates"}
              </button>
            ))}
          </div>

          {/* ── Tab: Email Activity ── */}
          {tab === "activity" && (
            <div>
              {/* Filters — M2: type filter triggers server refetch; search/date are client-side */}
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Type</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  >
                    <option value="">All types</option>
                    {TEMPLATE_TYPES.map((t) => (
                      <option key={t} value={t}>{TEMPLATE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From</label>
                  <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
                    className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
                    className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Search</label>
                  <input type="text" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)}
                    placeholder="org, email, subject…"
                    className="border border-gray-200 rounded px-2 py-1 text-xs w-44 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                </div>
                {(filterType || filterSearch || filterFrom || filterTo) && (
                  <button onClick={() => { setFilterType(""); setFilterSearch(""); setFilterFrom(""); setFilterTo(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline self-end pb-1">
                    Clear
                  </button>
                )}
                <span className="ml-auto text-xs text-gray-400 self-end pb-1">
                  {filteredLogs.length} shown · {logsTotal} total
                </span>
              </div>

              {logsLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  {logs.length === 0 ? "No emails logged yet. Run the cron to populate this." : "No emails match the current filters."}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Org</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Recipient</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Subject</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Sent At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredLogs.map((l) => (
                          <tr key={l.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{l.orgName ?? "—"}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="font-medium text-gray-800">{l.recipientName}</div>
                              <div className="text-xs text-gray-400">{l.recipientEmail}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${TYPE_BADGE_COLORS[l.emailType] ?? "bg-gray-100 text-gray-600"}`}>
                                {l.emailType.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{l.subject}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium ${l.status === "sent" ? "text-green-600" : "text-red-600"}`}>
                                {l.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtTime(l.sentAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* M2: Load More button */}
                  {logs.length < logsTotal && (
                    <div className="px-4 py-4 border-t border-gray-100 text-center">
                      <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="bg-gray-100 text-gray-600 text-sm px-6 py-2 rounded-md hover:bg-gray-200 disabled:opacity-50"
                      >
                        {loadingMore ? "Loading…" : `Load more (${logsTotal - logs.length} remaining)`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Tab: Churn Feedback ── */}
          {tab === "churn" && (
            <div>
              {churnLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
              ) : churnRows.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No churn responses yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Org</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Owner</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reason</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Trial Ended</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Last Login</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Projects</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Days Used</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {churnRows.map((r) => (
                        <tr key={r.orgId} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{r.orgName}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-gray-700">{r.ownerName ?? "—"}</div>
                            <div className="text-xs text-gray-400">{r.ownerEmail ?? ""}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                              {r.churnReason ? (CHURN_REASON_LABELS[r.churnReason] ?? r.churnReason) : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmt(r.trialEndsAt)}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmt(r.lastLoginAt)}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{r.projectCount}</td>
                          <td className="px-4 py-3 text-center text-gray-600">{r.daysTrialUsed ?? "—"}</td>
                          <td className="px-4 py-3 text-xs">
                            {r.dataWipedAt ? (
                              <span className="text-red-500">Wiped {fmt(r.dataWipedAt)}</span>
                            ) : (
                              <span className="text-green-600">Intact</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Email Templates ── */}
          {tab === "templates" && (
            <div className="p-6">
              {tplLoading ? (
                <div className="text-center text-gray-400 text-sm py-8">Loading…</div>
              ) : (
                <div className="flex gap-6">
                  {/* Template list */}
                  <div className="w-72 shrink-0 space-y-2">
                    {templates.map((t) => (
                      <button
                        key={t.emailType}
                        onClick={() => openEdit(t.emailType)}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition-colors text-sm ${
                          editingType === t.emailType
                            ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                            : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <div className="font-medium">{TEMPLATE_LABELS[t.emailType as TemplateType]}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {t.isCustom ? (
                            <span className="text-xs text-indigo-500 font-medium">Customised</span>
                          ) : (
                            <span className="text-xs text-gray-400">Default</span>
                          )}
                          {t.updatedBy && (
                            <span className="text-xs text-gray-400 truncate">· {t.updatedBy}</span>
                          )}
                        </div>
                        {t.updatedAt && (
                          <div className="text-xs text-gray-400 mt-0.5">{fmt(t.updatedAt)}</div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Editor */}
                  {editingType ? (
                    <div className="flex-1 min-w-0 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-indigo-700 uppercase tracking-widest">
                          {TEMPLATE_LABELS[editingType as TemplateType]}
                        </p>
                        <div className="text-xs text-gray-400">
                          Placeholders: {TEMPLATE_VARS[editingType as TemplateType]?.join(", ")}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subject Line</label>
                        <input
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Body HTML</label>
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={20}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-3 items-center">
                        <button
                          onClick={saveTemplate}
                          disabled={savingTpl}
                          className="bg-indigo-600 text-white text-sm px-5 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium"
                        >
                          {savingTpl ? "Saving…" : "Save Template"}
                        </button>
                        <button
                          onClick={previewTemplate}
                          className="bg-gray-100 text-gray-700 text-sm px-5 py-2 rounded-md hover:bg-gray-200 font-medium"
                        >
                          Preview
                        </button>
                        {/* M5: Version history */}
                        <button
                          onClick={openVersions}
                          className="bg-gray-100 text-gray-700 text-sm px-5 py-2 rounded-md hover:bg-gray-200 font-medium"
                        >
                          History
                        </button>
                        {/* L5: Send test email to admin */}
                        <button
                          onClick={sendTestEmail}
                          disabled={testSending}
                          className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-5 py-2 rounded-md hover:bg-amber-100 disabled:opacity-50 font-medium"
                        >
                          {testSending ? "Sending…" : "Send test to me"}
                        </button>
                        {/* L5: Save and restore messages are separate state so they don't overwrite each other */}
                        {saveMsg && (
                          <span className={`text-sm ${saveMsg.startsWith("Saved") ? "text-green-600" : "text-red-600"}`}>
                            {saveMsg}
                          </span>
                        )}
                        {restoreMsg && (
                          <span className="text-sm text-amber-600">{restoreMsg}</span>
                        )}
                        {testSendMsg && (
                          <span className={`text-sm ${testSendMsg.startsWith("Test sent") ? "text-green-600" : "text-red-600"}`}>
                            {testSendMsg}
                          </span>
                        )}
                      </div>

                      {/* Preview iframe */}
                      {showPreview && (
                        <div className="border border-gray-300 rounded-lg overflow-hidden">
                          <div className="bg-gray-100 px-4 py-2 text-xs font-medium text-gray-500 flex justify-between">
                            <span>Preview (sample data)</span>
                            <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                          <iframe
                            srcDoc={previewHtml}
                            className="w-full"
                            style={{ height: 600 }}
                            title="Email preview"
                          />
                        </div>
                      )}

                      {/* M5: Version history panel */}
                      {showVersions && (
                        <div className="border border-gray-300 rounded-lg overflow-hidden">
                          <div className="bg-gray-100 px-4 py-2 text-xs font-medium text-gray-500 flex justify-between items-center">
                            <span>Version History (last 10)</span>
                            <button onClick={() => setShowVersions(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                          {versionsLoading ? (
                            <div className="p-4 text-center text-xs text-gray-400">Loading history…</div>
                          ) : versions.length === 0 ? (
                            <div className="p-4 text-center text-xs text-gray-400">No saved versions yet. Save the template to create the first version.</div>
                          ) : (
                            <div className="divide-y divide-gray-100">
                              {versions.map((v) => (
                                <div key={v.id} className="px-4 py-3 flex items-start justify-between gap-4 hover:bg-gray-50">
                                  <div>
                                    <div className="text-xs font-medium text-gray-700">{v.subject}</div>
                                    <div className="text-xs text-gray-400 mt-0.5">
                                      {fmtTime(v.savedAt)}{v.savedBy ? ` · ${v.savedBy}` : ""}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => restoreVersion(v)}
                                    className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                  >
                                    Restore
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                      Select a template on the left to edit it
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
