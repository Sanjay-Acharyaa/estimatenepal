"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

type LogEntry = {
  id: string;
  event: string;
  resourceId: string | null;
  meta: unknown;
  ipAddress: string | null;
  createdAt: string;
  orgId: string;
  orgName: string;
  user: { id: string; name: string | null; email: string };
};

export default function AuditLogPage() {
  const [logs, setLogs]         = useState<LogEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [orgFilter, setOrg]     = useState("");
  const debounceRef             = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback((event?: string, orgId?: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (event)  params.set("event", event);
    if (orgId)  params.set("orgId", orgId);
    fetch(`/api/admin/audit?${params}`)
      .then(r => r.ok ? r.json() : [])
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSearch(val: string) {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(val || undefined, orgFilter || undefined), 400);
  }

  function handleOrg(val: string) {
    setOrg(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(search || undefined, val || undefined), 400);
  }

  const uniqueOrgs = Array.from(new Map(logs.map(l => [l.orgId, l.orgName])).entries());

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-red-200 hover:text-white text-sm">← Admin</Link>
        <span className="font-bold text-lg">Audit Log</span>
        <span className="text-red-200 text-sm">Last 200 events</span>
        <button onClick={() => load(search || undefined, orgFilter || undefined)} className="ml-auto text-sm text-red-200 hover:text-white">
          Refresh
        </button>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <input
            type="text"
            placeholder="Filter by event (e.g. member.removed)…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 w-72"
          />
          <select
            value={orgFilter}
            onChange={e => handleOrg(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            <option value="">All orgs</option>
            {uniqueOrgs.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <span className="self-center text-sm text-gray-400">{logs.length} entries</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Org</th>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Event</th>
                <th className="text-left px-4 py-3">Resource</th>
                <th className="text-left px-4 py-3">IP</th>
                <th className="text-left px-4 py-3">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No audit events found.</td></tr>
              )}
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString("en-NP", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 text-gray-600 text-xs max-w-[120px] truncate" title={l.orgName}>
                    {l.orgName}
                  </td>
                  <td className="px-4 py-2 text-gray-600 text-xs max-w-[150px] truncate" title={l.user.email}>
                    {l.user.name ?? l.user.email}
                  </td>
                  <td className="px-4 py-2">
                    <code className="text-xs bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded font-mono">{l.event}</code>
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs font-mono truncate max-w-[120px]" title={l.resourceId ?? ""}>
                    {l.resourceId ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs font-mono">
                    {l.ipAddress ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs max-w-[200px] truncate">
                    {l.meta ? JSON.stringify(l.meta) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
