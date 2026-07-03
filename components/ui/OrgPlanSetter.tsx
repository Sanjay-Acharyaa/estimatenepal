"use client";

import { useState } from "react";

const PLANS = [
  { value: "TRIAL",      label: "Trial",      color: "bg-gray-100 text-gray-700" },
  { value: "SOLO",       label: "Solo",       color: "bg-blue-100 text-blue-700" },
  { value: "TEAM_3",     label: "Team of 3",  color: "bg-indigo-100 text-indigo-700" },
  { value: "TEAM_5",     label: "Team of 5",  color: "bg-purple-100 text-purple-700" },
  { value: "ENTERPRISE", label: "Enterprise", color: "bg-amber-100 text-amber-700" },
  { value: "ACADEMIC",   label: "Academic",   color: "bg-teal-100 text-teal-700" },
] as const;

export function OrgPlanSetter({ orgId, current }: { orgId: string; current: string }) {
  const [plan, setPlan] = useState(current || "TRIAL");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const info = PLANS.find(p => p.value === plan) ?? PLANS[0];

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newPlan = e.target.value;
    setPlan(newPlan);
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/admin/orgs/${orgId}/plan`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planTier: newPlan }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>
        {info.label}
      </span>
      <select
        value={plan}
        onChange={handleChange}
        disabled={saving}
        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
        title="Change plan"
      >
        {PLANS.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      {saving && <span className="text-xs text-gray-400">…</span>}
      {saved && !saving && <span className="text-xs text-green-600">✓</span>}
    </div>
  );
}
