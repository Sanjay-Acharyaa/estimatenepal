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
        <p key={d.label} className="text-xs text-gray-600 flex items-center gap-1 flex-wrap">
          <span className="font-medium text-gray-700">{d.label}:</span>
          {d.label === "Colour" ? (
            <>
              <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ background: d.from }} aria-hidden />
              <span className="text-gray-500">→</span>
              <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ background: d.to }} aria-hidden />
            </>
          ) : (
            <>
              <span className="text-red-600 line-through">{d.from}</span>
              <span className="text-gray-500">→</span>
              <span className="text-green-700 font-medium">{d.to}</span>
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
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const unread = notifications.filter((n) => !n.isRead).length;

  async function fetchNotifications() {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch("/api/notifications?limit=15");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data);
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "PUT" });
    setNotifications((ns) => ns.map((n) => ({ ...n, isRead: true })));
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        bellRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {/* Bell button — aria-label replaces title for screen readers */}
      <button
        ref={bellRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative p-1.5 rounded-lg hover:bg-gray-100 transition"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* Badge is aria-hidden — count is already in the button's aria-label */}
        {unread > 0 && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications panel"
          className="absolute left-full ml-2 top-0 w-[22rem] bg-white border border-gray-200 rounded-xl shadow-lg z-50"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {/* Loading state */}
            {loading && notifications.length === 0 && (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-500 text-sm">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading…
              </div>
            )}

            {/* Error state */}
            {fetchError && (
              <div className="px-4 py-6 text-center" role="alert">
                <p className="text-sm text-red-600 mb-2">Could not load notifications.</p>
                <button onClick={fetchNotifications} className="text-xs text-blue-600 hover:underline">
                  Try again
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !fetchError && notifications.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">No notifications</p>
            )}

            {notifications.map((n) => {
              const content = (
                <>
                  <p className={`text-sm leading-snug ${!n.isRead ? "font-medium text-gray-900" : "text-gray-700"}`}>
                    {n.message}
                  </p>
                  {n.type === "assembly.group_updated" && n.meta && <AssemblyDiff meta={n.meta} />}
                  <p className="text-xs text-gray-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </>
              );

              return (
                <div
                  key={n.id}
                  className={`px-4 py-3 transition ${!n.isRead ? "bg-blue-50" : ""}`}
                >
                  {n.link ? (
                    /* Linked notification — clicking the link also marks it read */
                    <Link
                      href={n.link}
                      onClick={() => markRead(n.id)}
                      className="block hover:bg-gray-50 -mx-4 -my-3 px-4 py-3 rounded"
                    >
                      {content}
                    </Link>
                  ) : (
                    /* Non-linked notification — <button> so it is keyboard reachable */
                    <button
                      onClick={() => markRead(n.id)}
                      className="w-full text-left hover:bg-gray-50 -mx-4 -my-3 px-4 py-3 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {content}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
