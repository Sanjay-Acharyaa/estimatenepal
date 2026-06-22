"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type PresenceUser = {
  userId: string; name: string; email: string; orgName: string | null;
  path: string; sessionStart: string; lastSeen: string; pageCount: number;
};

type TopUser = {
  userId: string; name: string; email: string; orgName: string | null;
  totalSeconds: number; sessionCount: number; longestSessionSeconds: number; lastActive: string | null;
};

type PresenceResponse = {
  online: PresenceUser[];
  heatmap: number[][];
  topUsers: TopUser[];
  dailyByUser: Record<string, Record<string, number>>;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function sessionDuration(start: string): string {
  const secs = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
  return fmt(secs);
}

function pathLabel(path: string): string {
  if (path === "/dashboard") return "Dashboard";
  if (path.includes("/boq")) return "BOQ";
  if (path.includes("/drawings")) return "Drawings";
  if (path.includes("/projects/new")) return "New Project";
  if (path.includes("/projects")) return "Project";
  if (path.includes("/rates")) return "Rates";
  if (path.includes("/settings")) return "Settings";
  if (path.includes("/assemblies")) return "Assemblies";
  if (path.includes("/admin")) return "Admin";
  return path;
}

function HeatmapGrid({ heatmap }: { heatmap: number[][] }) {
  const maxVal = Math.max(...heatmap.flat(), 1);
  const todayDow = new Date().getDay();

  return (
    <div>
      <div className="flex gap-1 mb-1">
        <div className="w-10" />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="w-6 text-center text-xs text-gray-400 leading-none">
            {h % 3 === 0 ? `${h}` : ""}
          </div>
        ))}
      </div>
      {DAYS.map((day, dow) => (
        <div key={dow} className="flex items-center gap-1 mb-1">
          <div className={`w-10 text-xs text-right pr-2 ${dow === todayDow ? "font-bold text-indigo-700" : "text-gray-400"}`}>
            {day}
          </div>
          {heatmap[dow].map((count, h) => {
            const intensity = count / maxVal;
            const bg = count === 0 ? "bg-gray-100"
              : intensity < 0.25 ? "bg-indigo-100"
              : intensity < 0.5  ? "bg-indigo-300"
              : intensity < 0.75 ? "bg-indigo-500"
              : "bg-indigo-700";
            return (
              <div
                key={h}
                className={`w-6 h-6 rounded-sm ${bg} cursor-default`}
                title={`${day} ${h}:00 — ${count} pings`}
              />
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-gray-400">Less</span>
        {["bg-gray-100", "bg-indigo-100", "bg-indigo-300", "bg-indigo-500", "bg-indigo-700"].map(c => (
          <div key={c} className={`w-4 h-4 rounded-sm ${c}`} />
        ))}
        <span className="text-xs text-gray-400">More</span>
      </div>
    </div>
  );
}

function DailyBar({ userId, dailyByUser }: { userId: string; dailyByUser: Record<string, Record<string, number>> }) {
  const byDate = dailyByUser[userId] ?? {};
  const days = Object.entries(byDate).sort(([a], [b]) => b.localeCompare(a)).slice(0, 7);
  const maxSec = Math.max(...days.map(([, s]) => s), 1);

  if (days.length === 0) return <span className="text-xs text-gray-300">No data yet</span>;

  return (
    <div className="flex items-end gap-1">
      {days.reverse().map(([date, secs]) => {
        const h = Math.min((secs / maxSec) * 32, 32);
        const label = new Date(date).toLocaleDateString("en-NP", { weekday: "short", day: "numeric" });
        return (
          <div key={date} className="flex flex-col items-center gap-0.5" title={`${label}: ${fmt(secs)}`}>
            <div className="w-5 bg-indigo-400 rounded-t-sm" style={{ height: `${Math.max(h, 2)}px` }} />
            <span className="text-xs text-gray-400" style={{ fontSize: "9px" }}>{fmt(secs)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ActivityPage() {
  const [data, setData] = useState<PresenceResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/presence");
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => { load(); setTick(t => t + 1); }, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Live session duration tick every second
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const online = data?.online ?? [];
  const heatmap = data?.heatmap ?? Array.from({ length: 7 }, () => new Array(24).fill(0));
  const topUsers = data?.topUsers ?? [];
  const dailyByUser = data?.dailyByUser ?? {};

  // Peak hour from heatmap
  let peakDow = 0, peakHour = 0, peakVal = 0;
  heatmap.forEach((row, d) => row.forEach((v, h) => { if (v > peakVal) { peakVal = v; peakDow = d; peakHour = h; } }));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-indigo-700 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-indigo-300 hover:text-white text-sm">← Admin</Link>
        <span className="font-bold text-lg">User Activity</span>
        <span className="text-indigo-300 text-sm ml-auto">
          Refreshes every 30s · Last: {lastRefresh.toLocaleTimeString("en-NP")}
        </span>
        <button onClick={load} className="text-xs bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg">
          Refresh now
        </button>
      </div>

      <div className="p-6 space-y-8 max-w-screen-xl mx-auto">

        {/* ── Online Now ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest">Online Now</h2>
            <span className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
              online.length > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}>
              <span className={`w-2 h-2 rounded-full ${online.length > 0 ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
              {online.length} online
            </span>
          </div>

          {online.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              No users online right now
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {online.map(u => (
                <div key={u.userId} className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                      {u.orgName && <div className="text-xs text-indigo-600 font-medium mt-0.5">{u.orgName}</div>}
                    </div>
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mt-1 flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <span className="bg-gray-100 rounded px-2 py-0.5 font-mono">{pathLabel(u.path)}</span>
                    <span>{u.pageCount} pages</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Session: <strong className="text-gray-700">{sessionDuration(u.sessionStart)}</strong></span>
                    <span>Active {sessionDuration(u.lastSeen)} ago</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Peak Hours Heatmap ─────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-4 mb-3">
            <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest">Peak Hours (All Time)</h2>
            {peakVal > 0 && (
              <span className="text-xs text-gray-500">
                Peak: <strong className="text-indigo-700">{DAYS[peakDow]} at {peakHour}:00</strong>
              </span>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 overflow-x-auto">
            {peakVal === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Data accumulates as users browse the app.</p>
            ) : (
              <HeatmapGrid heatmap={heatmap} />
            )}
          </div>
        </section>

        {/* ── Top Users by Time Spent ────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">
            Power Users — Time Spent (Last 30 Days)
          </h2>
          {topUsers.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              Session data accumulates as users work. Check back after a day.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["#", "User", "Org", "Total Time", "Sessions", "Longest Session", "Daily Activity (7d)", "Last Active"].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-gray-600 font-semibold text-xs whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topUsers.map((u, i) => (
                    <tr key={u.userId} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-gray-900 text-sm">{u.name}</div>
                        <div className="text-xs text-gray-400">{u.email}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-indigo-600">{u.orgName ?? "—"}</td>
                      <td className="px-3 py-3">
                        <span className="font-bold text-gray-900 text-sm">{fmt(u.totalSeconds)}</span>
                        <div className="text-xs text-gray-400">
                          avg {fmt(Math.round(u.totalSeconds / Math.max(u.sessionCount, 1)))} / session
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-600 text-center font-semibold">{u.sessionCount}</td>
                      <td className="px-3 py-3 text-gray-600 text-sm">{fmt(u.longestSessionSeconds)}</td>
                      <td className="px-3 py-3">
                        <DailyBar userId={u.userId} dailyByUser={dailyByUser} />
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {u.lastActive
                          ? new Date(u.lastActive).toLocaleDateString("en-NP", { day: "2-digit", month: "short" })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Insights ──────────────────────────────────────────────────── */}
        {topUsers.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-widest mb-3">Quick Insights</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  label: "Most Active User",
                  value: topUsers[0]?.name ?? "—",
                  sub: topUsers[0] ? `${fmt(topUsers[0].totalSeconds)} total` : "",
                  color: "bg-indigo-50 border-indigo-200 text-indigo-700",
                },
                {
                  label: "Longest Single Session",
                  value: fmt(Math.max(...topUsers.map(u => u.longestSessionSeconds))),
                  sub: topUsers.reduce((best, u) => u.longestSessionSeconds > best.longestSessionSeconds ? u : best, topUsers[0])?.name ?? "",
                  color: "bg-amber-50 border-amber-200 text-amber-700",
                },
                {
                  label: "Peak Activity Time",
                  value: peakVal > 0 ? `${DAYS[peakDow]} ${peakHour}:00` : "—",
                  sub: peakVal > 0 ? "Most active hour across all users" : "Not enough data yet",
                  color: "bg-green-50 border-green-200 text-green-700",
                },
              ].map(card => (
                <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
                  <div className="text-xs font-medium opacity-70 mb-1">{card.label}</div>
                  <div className="text-xl font-bold">{card.value}</div>
                  <div className="text-xs opacity-60 mt-0.5">{card.sub}</div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
