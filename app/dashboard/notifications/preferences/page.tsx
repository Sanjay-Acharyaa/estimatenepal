"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Pref = {
  eventKey: string;
  displayName: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
};

function categoryLabel(eventKey: string): string {
  if (eventKey.startsWith("client_")) return "Client";
  if (eventKey.startsWith("contractor_")) return "Contractor";
  if (eventKey.startsWith("admin_")) return "Admin";
  if (eventKey.startsWith("consultant_")) return "Consultant";
  return "General";
}

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then(setPrefs)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(eventKey: string, field: "emailEnabled" | "inAppEnabled", value: boolean) {
    setSaving(eventKey + field);
    setPrefs((ps) => ps.map((p) => (p.eventKey === eventKey ? { ...p, [field]: value } : p)));
    await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventKey, [field]: value }),
    }).catch(() => {});
    setSaving(null);
  }

  // Group by category
  const groups = prefs.reduce<Record<string, Pref[]>>((acc, p) => {
    const cat = categoryLabel(p.eventKey);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const categoryOrder = ["Client", "Contractor", "Consultant", "Admin", "General"];
  const orderedGroups = categoryOrder.filter((c) => groups[c]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/notifications" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Notification Preferences</h1>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-400 text-sm">Loading preferences…</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-500 text-sm">Could not load preferences. Refresh to try again.</div>
      )}

      {!loading && !error && (
        <div className="space-y-8">
          {orderedGroups.map((cat) => (
            <div key={cat}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{cat}</h2>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_80px_80px] items-center px-5 py-2.5 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs text-gray-400 font-medium">Notification</span>
                  <span className="text-xs text-gray-400 font-medium text-center">Email</span>
                  <span className="text-xs text-gray-400 font-medium text-center">In-app</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {groups[cat].map((p) => (
                    <div key={p.eventKey} className="grid grid-cols-[1fr_80px_80px] items-center px-5 py-3">
                      <span className="text-sm text-gray-700">{p.displayName.replace(/^(Client|Contractor|Consultant|Admin)\s[—–-]\s/, "")}</span>
                      {/* Email toggle */}
                      <div className="flex justify-center">
                        <button
                          role="switch"
                          aria-checked={p.emailEnabled}
                          aria-label={`Email for ${p.displayName}`}
                          disabled={saving === p.eventKey + "emailEnabled"}
                          onClick={() => toggle(p.eventKey, "emailEnabled", !p.emailEnabled)}
                          className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${p.emailEnabled ? "bg-blue-600" : "bg-gray-200"} disabled:opacity-50`}
                        >
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${p.emailEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                      {/* In-app toggle */}
                      <div className="flex justify-center">
                        <button
                          role="switch"
                          aria-checked={p.inAppEnabled}
                          aria-label={`In-app for ${p.displayName}`}
                          disabled={saving === p.eventKey + "inAppEnabled"}
                          onClick={() => toggle(p.eventKey, "inAppEnabled", !p.inAppEnabled)}
                          className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${p.inAppEnabled ? "bg-blue-600" : "bg-gray-200"} disabled:opacity-50`}
                        >
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${p.inAppEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
