"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface RateSettings {
  overheadPct: number;
  profitPct: number;
  contingencyPct: number;
  vatPct: number;
  leadLiftPct: number;
  dryVolumeMortar: number;
  dryVolumeConcrete: number;
}

const DEFAULTS: RateSettings = {
  overheadPct: 12,
  profitPct: 10,
  contingencyPct: 5,
  vatPct: 13,
  leadLiftPct: 0,
  dryVolumeMortar: 1.30,
  dryVolumeConcrete: 1.54,
};

const FIELDS: Array<{
  key: keyof RateSettings;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
}> = [
  { key: "overheadPct", label: "Overhead", help: "General management, site infrastructure, tools, and administration costs.", min: 0, max: 100, step: 0.5, suffix: "%" },
  { key: "profitPct", label: "Contractor Profit", help: "Applied to direct cost + overhead. Standard Nepal practice: 10%.", min: 0, max: 100, step: 0.5, suffix: "%" },
  { key: "contingencyPct", label: "Contingency", help: "Reserve for unforeseen conditions. DUDBC standard: 5%.", min: 0, max: 50, step: 0.5, suffix: "%" },
  { key: "vatPct", label: "VAT", help: "Government VAT on construction works. Current Nepal rate: 13%.", min: 0, max: 30, step: 0.5, suffix: "%" },
  { key: "leadLiftPct", label: "Lead and Lift", help: "Additional haulage and hoisting cost for remote or elevated sites. 0% for standard sites.", min: 0, max: 50, step: 0.5, suffix: "%" },
  { key: "dryVolumeMortar", label: "Dry Volume Factor (Mortar)", help: "DUDBC standard: 1.30. Converts wet mortar volume to dry ingredients needed.", min: 1.0, max: 1.8, step: 0.01, suffix: "x" },
  { key: "dryVolumeConcrete", label: "Dry Volume Factor (Concrete)", help: "DUDBC standard: 1.54. Converts wet concrete volume to dry ingredients needed.", min: 1.0, max: 1.8, step: 0.01, suffix: "x" },
];

export function RateSettingsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [settings, setSettings] = useState<RateSettings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/orgs/rate-settings")
      .then(r => r.json())
      .then(d => {
        const s = d.settings ?? DEFAULTS;
        setSettings(s);
        setForm(Object.fromEntries(FIELDS.map(f => [f.key, String(s[f.key])])));
      })
      .catch(() => {
        setSettings(DEFAULTS);
        setForm(Object.fromEntries(FIELDS.map(f => [f.key, String(DEFAULTS[f.key])])));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    const payload: Record<string, number> = {};
    for (const field of FIELDS) {
      const v = parseFloat(form[field.key]);
      if (isNaN(v) || v < field.min || v > field.max) {
        toast.error(`${field.label} must be between ${field.min} and ${field.max}.`);
        return;
      }
      payload[field.key] = v;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/orgs/rate-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setDirty(false);
        toast.success("Rate settings saved.");
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error?.message ?? d.error ?? "Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setForm(Object.fromEntries(FIELDS.map(f => [f.key, String(DEFAULTS[f.key])])));
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-600 text-sm">Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-800">Rate Calculation Settings</p>
        <p className="text-xs text-gray-500 mt-0.5">
          These values apply to all resource-based rate analyses in your organisation.
          Individual analyses can override them in the future.
        </p>
      </div>

      <div className="space-y-4">
        {FIELDS.map(field => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-0.5">
              {field.label}
              <span className="ml-1 text-gray-400 font-normal">(default: {DEFAULTS[field.key]}{field.suffix})</span>
            </label>
            <div className="flex items-center gap-3">
              {isAdmin ? (
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={form[field.key] ?? ""}
                  onChange={e => handleChange(field.key, e.target.value)}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <span className="text-sm font-semibold text-gray-800 w-28 inline-block">
                  {settings?.[field.key]}{field.suffix}
                </span>
              )}
              <span className="text-sm text-gray-500">{field.suffix}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{field.help}</p>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
          <button
            onClick={resetToDefaults}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Reset to DUDBC Defaults
          </button>
          {!dirty && !saving && (
            <span className="text-xs text-gray-400">All saved</span>
          )}
        </div>
      )}
    </div>
  );
}
