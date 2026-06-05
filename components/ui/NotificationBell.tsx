"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

type AssemblyMeta = {
  assemblyName?: string;
  layerName?: string;
  scope?: string;
  updatedProjects?: number;
  before?: { name?: string; type?: string; colour?: string; rateCode?: string | null };
  after?: { name?: string; type?: string; colour?: string; rateCode?: string | null };
};

type Notification = {
  id: string;
  type: string;
  message: string;
  link: string | null;
  meta?: AssemblyMeta | null;
  isRead: boolean;
  createdAt: string;
};

function AssemblyDiff({ meta }: { meta: AssemblyMeta }) {
  const { before, after } = meta;
  if (!before || !after) return null;
  const diffs: { label: string; from: string; to: string }[] = [];
  if (before.name !== after.name) diffs.push({ label: "Name", from: before.name ?? "", to: after.name ?? "" });
  if (before.type !== after.type) diffs.push({ label: "Type", from: before.type ?? "", to: after.type ?? "" });
  if (before.colour !== after.colour) diffs.push({ label: "Colour", from: before.colour ?? "", to: after.colour ?? "" });
  if (before.rateCode !== after.rateCode) diffs.push({ label: "Rate", from: before.rateCode ?? "none", to: after.rateCode ?? "none" });
  if (!diffs.length) return null;
  return (
    <div className="mt-1.5 bg-white border border-gray-200 rounded p-2 space-y-0.5">
      {diffs.map(d => (
        <p key={d.label} className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
          <span className="font-medium text-gray-600">{d.label}:</span>
          {d.label === "Colour" ? (
            <>
              <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ background: d.from }} />
              <span className="text-gray-400">→</span>
              <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ background: d.to }} />
            </>
          ) : (
            <>
              <span className="text-red-500 line-through">{d.from}</span>
              <span className="text-gray-400">→</span>
              <span className="text-green-600 font-medium">{d.to}</span>
            </>
          )}
        </p>
      ))}
    </div>
  );
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.isRead).length;

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications?limit=15");
      if (res.ok) { const data = await res.json(); setNotifications(data.data); }
    } catch { /* server still compiling */ }
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "PUT" });
    setNotifications((ns) => ns.map((n) => ({ ...n, isRead: true })));
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
    setNotifications((ns) => ns.map((n) => n.id === id ? { ...n, isRead: true } : n));
  }

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-lg hover:bg-gray-100 transition" title="Notifications">
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full ml-2 top-0 w-84 bg-white border border-gray-200 rounded-xl shadow-lg z-50" style={{ width: "22rem" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">Mark all read</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No notifications</p>
            )}
            {notifications.map((n) => (
              <div key={n.id} onClick={() => markRead(n.id)}
                className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition ${!n.isRead ? "bg-blue-50" : ""}`}>
                {n.link ? (
                  <Link href={n.link} className="block">
                    <p className={`text-sm leading-snug ${!n.isRead ? "font-medium text-gray-900" : "text-gray-600"}`}>{n.message}</p>
                    {n.type === "assembly.group_updated" && n.meta && <AssemblyDiff meta={n.meta} />}
                    <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </Link>
                ) : (
                  <>
                    <p className={`text-sm leading-snug ${!n.isRead ? "font-medium text-gray-900" : "text-gray-600"}`}>{n.message}</p>
                    {n.type === "assembly.group_updated" && n.meta && <AssemblyDiff meta={n.meta} />}
                    <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
