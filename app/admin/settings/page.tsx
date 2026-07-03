"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ConfigEntry = { key: string; value: string; default: string; description: string };

// Grouped sections — order determines display order in UI
const SECTIONS = [
  {
    title: "Branding",
    description: "Logo, site name, and page copy. Changes appear within 5 minutes.",
    keys: [
      "site_name",
      "site_logo_url",
      "site_favicon_url",
      "login_headline",
      "login_subtext",
      "register_headline",
      "register_subtext",
      "og_title",
      "og_description",
    ],
  },
  {
    title: "Pricing & Trial",
    description: "Prices shown on landing page. Trial length for new signups.",
    keys: ["trial_days", "price_solo_monthly", "price_team3_monthly", "price_team5_monthly", "price_per_seat_enterprise", "annual_free_months"],
  },
  {
    title: "Storage Limits",
    description: "Per-org storage cap in gigabytes.",
    keys: ["storage_limit_solo_gb", "storage_limit_team_gb"],
  },
  {
    title: "Contact",
    description: "Shown in trial banners and upgrade prompts.",
    keys: ["contact_email", "contact_whatsapp", "whatsapp_message", "payment_qr_url"],
  },
  {
    title: "Access Control",
    description: "Enable or disable features site-wide.",
    keys: ["maintenance_mode", "registration_enabled"],
  },
  {
    title: "Announcements",
    description: "Banner shown inside the dashboard for all logged-in users.",
    keys: ["site_announcement"],
  },
];

// Image fields show a live preview below the input
const IMAGE_URL_KEYS = new Set(["site_logo_url", "site_favicon_url", "payment_qr_url"]);

// Fields that show a multiline textarea
const MULTILINE_KEYS = new Set(["whatsapp_message", "site_announcement", "login_subtext", "register_subtext", "og_description", "login_headline", "register_headline"]);

// Extra hint shown under the field (over the description)
const FIELD_HINTS: Record<string, { size: string; formats: string }> = {
  site_logo_url: { size: "200 × 50 px", formats: "PNG (transparent bg) or SVG · max 500 KB" },
  site_favicon_url: { size: "64 × 64 px", formats: "PNG or SVG · square · max 100 KB" },
  payment_qr_url: { size: "400 × 400 px recommended", formats: "PNG or JPG · square · max 500 KB · must be a public URL" },
};

export default function AdminSettingsPage() {
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/config")
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load config (${r.status})`);
        return r.json();
      })
      .then((data: ConfigEntry[]) => {
        setEntries(data);
        const initial: Record<string, string> = {};
        data.forEach(e => { initial[e.key] = e.value; });
        setEditing(initial);
        setLoading(false);
      })
      .catch((err: Error) => {
        setLoadError(err.message ?? "Failed to load settings.");
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
      setMsgs(m => ({ ...m, [key]: "✓ Saved" }));
      setEntries(e => e.map(x => x.key === key ? { ...x, value: editing[key] } : x));
    } else {
      setMsgs(m => ({ ...m, [key]: data.error?.message ?? "Error saving" }));
    }
  }

  function reset(key: string, defaultVal: string) {
    setEditing(e => ({ ...e, [key]: defaultVal }));
  }

  const entryMap = Object.fromEntries(entries.map(e => [e.key, e]));

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-red-200 hover:text-white text-sm">← Admin</Link>
        <span className="font-bold text-lg">Site Settings</span>
        <span className="text-red-200 text-sm ml-auto">Changes apply within 5 minutes — no redeploy needed</span>
      </div>

      <div className="p-8 max-w-3xl mx-auto space-y-10">
        {loading ? (
          <div className="flex items-center gap-3 text-gray-500 text-sm py-12">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            Loading settings…
          </div>
        ) : loadError ? (
          <p role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{loadError}</p>
        ) : (
          SECTIONS.map(section => {
            const sectionEntries = section.keys.map(k => entryMap[k]).filter(Boolean);
            if (!sectionEntries.length) return null;

            return (
              <div key={section.title}>
                {/* Section header */}
                <div className="mb-4">
                  <h2 className="text-base font-bold text-gray-900">{section.title}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{section.description}</p>
                </div>

                <div className="space-y-4">
                  {sectionEntries.map(entry => {
                    const isDirty = editing[entry.key] !== entry.value;
                    const isMultiline = MULTILINE_KEYS.has(entry.key);
                    const isImage = IMAGE_URL_KEYS.has(entry.key);
                    const hint = FIELD_HINTS[entry.key];
                    const saved = msgs[entry.key] === "✓ Saved";

                    return (
                      <div key={entry.key} className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <code className="text-xs font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                {entry.key}
                              </code>
                              {isImage && (
                                <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-medium">
                                  Image URL
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{entry.description}</p>
                            {hint && (
                              <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
                                <svg className="w-3.5 h-3.5 mt-px text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span><strong>Size:</strong> {hint.size} &nbsp;·&nbsp; <strong>Format:</strong> {hint.formats}</span>
                              </div>
                            )}
                            {!hint && (
                              <p className="text-xs text-gray-400 mt-1">Default: <span className="font-mono">{entry.default || "(empty)"}</span></p>
                            )}
                          </div>
                          {msgs[entry.key] && (
                            <span className={`text-xs font-medium flex-shrink-0 ${saved ? "text-green-600" : "text-red-600"}`}>
                              {msgs[entry.key]}
                            </span>
                          )}
                        </div>

                        {/* Image preview */}
                        {isImage && editing[entry.key] && (
                          <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                            <div className="text-xs text-gray-500 font-medium w-16 flex-shrink-0">Preview:</div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={editing[entry.key]}
                              alt="Preview"
                              className="max-h-12 max-w-[200px] object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          </div>
                        )}

                        <div className="flex gap-2 items-start">
                          {isMultiline ? (
                            <textarea
                              rows={entry.key === "og_description" || entry.key === "whatsapp_message" ? 3 : 2}
                              value={editing[entry.key] ?? ""}
                              onChange={e => setEditing(prev => ({ ...prev, [entry.key]: e.target.value }))}
                              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                          ) : (
                            <input
                              type={isImage ? "url" : "text"}
                              value={editing[entry.key] ?? ""}
                              onChange={e => setEditing(prev => ({ ...prev, [entry.key]: e.target.value }))}
                              placeholder={isImage ? "https://..." : undefined}
                              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          )}
                          <button
                            onClick={() => save(entry.key)}
                            disabled={saving === entry.key || !isDirty}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 flex-shrink-0 min-w-[60px]"
                          >
                            {saving === entry.key ? "…" : "Save"}
                          </button>
                          {isDirty && (
                            <button
                              onClick={() => reset(entry.key, entry.default)}
                              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 flex-shrink-0"
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
