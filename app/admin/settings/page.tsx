"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ConfigEntry = {
  key: string;
  value: string;
  default: string;
  description: string;
};

export default function AdminSettingsPage() {
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/config")
      .then(r => r.json())
      .then((data: ConfigEntry[]) => {
        setEntries(data);
        const initial: Record<string, string> = {};
        data.forEach(e => { initial[e.key] = e.value; });
        setEditing(initial);
        setLoading(false);
      });
  }, []);

  async function save(key: string) {
    setSaving(key);
    setMsgs(m => ({ ...m, [key]: "" }));
    const res = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: editing[key] }),
    });
    const data = await res.json();
    setSaving(null);
    if (res.ok) {
      setMsgs(m => ({ ...m, [key]: "Saved" }));
      setEntries(e => e.map(x => x.key === key ? { ...x, value: editing[key] } : x));
    } else {
      setMsgs(m => ({ ...m, [key]: data.error?.message ?? "Error" }));
    }
  }

  function reset(key: string, defaultVal: string) {
    setEditing(e => ({ ...e, [key]: defaultVal }));
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-red-200 hover:text-white text-sm">← Admin</Link>
        <span className="font-bold text-lg">Site Settings</span>
        <span className="text-red-200 text-sm">Changes apply within 5 minutes — no redeploy needed</span>
      </div>

      <div className="p-8 max-w-3xl mx-auto">
        {loading ? (
          <p className="text-gray-500 text-sm">Loading config…</p>
        ) : (
          <div className="space-y-4">
            {entries.map(entry => {
              const isDirty = editing[entry.key] !== entry.value;
              const isMultiline = entry.key === "whatsapp_message" || entry.key === "site_announcement";
              return (
                <div key={entry.key} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <code className="text-xs font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                        {entry.key}
                      </code>
                      <p className="text-sm text-gray-600 mt-0.5">{entry.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Default: <span className="font-mono">{entry.default || "(empty)"}</span></p>
                    </div>
                    {msgs[entry.key] && (
                      <span className="text-xs text-green-600 font-medium flex-shrink-0">{msgs[entry.key]}</span>
                    )}
                  </div>
                  <div className="flex gap-2 items-start">
                    {isMultiline ? (
                      <textarea
                        rows={3}
                        value={editing[entry.key] ?? ""}
                        onChange={e => setEditing(prev => ({ ...prev, [entry.key]: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={editing[entry.key] ?? ""}
                        onChange={e => setEditing(prev => ({ ...prev, [entry.key]: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                    <button
                      onClick={() => save(entry.key)}
                      disabled={saving === entry.key || !isDirty}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 flex-shrink-0"
                    >
                      {saving === entry.key ? "…" : "Save"}
                    </button>
                    {isDirty && (
                      <button
                        onClick={() => reset(entry.key, entry.default)}
                        className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 flex-shrink-0"
                        title="Reset to default"
                      >
                        ↩
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
