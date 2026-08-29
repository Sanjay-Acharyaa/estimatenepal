"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Notification = {
  id: string;
  type: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

type PaginatedResponse = {
  data: Notification[];
  total: number;
  page: number;
  totalPages: number;
};

export function NotificationListPanel() {
  const [items, setItems] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load(p: number) {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/notifications?page=${p}&limit=25`);
      if (!res.ok) throw new Error();
      const json: PaginatedResponse = await res.json();
      setItems(json.data);
      setPage(json.page);
      setTotalPages(json.totalPages);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
    setItems((ns) => ns.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "PUT" });
    setItems((ns) => ns.map((n) => ({ ...n, isRead: true })));
  }

  const unread = items.filter((n) => !n.isRead).length;

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading notifications…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600 text-sm mb-3">Could not load notifications.</p>
        <button onClick={() => load(page)} className="text-sm text-blue-600 hover:underline">Try again</button>
      </div>
    );
  }

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
          {unread > 0 && (
            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {unread} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {unread > 0 && (
            <button onClick={markAllRead} className="text-sm text-blue-600 hover:underline">
              Mark all read
            </button>
          )}
          <Link href="/dashboard/notifications/preferences" className="text-sm text-gray-500 hover:text-gray-700">
            Preferences
          </Link>
        </div>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No notifications yet.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
          {items.map((n) => {
            const inner = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm leading-snug flex-1 ${!n.isRead ? "font-medium text-gray-900" : "text-gray-600"}`}>
                    {n.message}
                  </p>
                  {!n.isRead && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); markRead(n.id); }}
                      className="text-xs text-blue-500 hover:text-blue-700 whitespace-nowrap flex-shrink-0 mt-0.5"
                    >
                      Mark read
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">{new Date(n.createdAt).toLocaleString()}</p>
              </>
            );

            return (
              <div key={n.id} className={`px-5 py-4 transition ${!n.isRead ? "bg-blue-50/50" : ""}`}>
                {n.link ? (
                  <Link href={n.link} onClick={() => markRead(n.id)} className="block">
                    {inner}
                  </Link>
                ) : (
                  <div>{inner}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <button
            onClick={() => load(page - 1)}
            disabled={page <= 1 || loading}
            className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= totalPages || loading}
            className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
