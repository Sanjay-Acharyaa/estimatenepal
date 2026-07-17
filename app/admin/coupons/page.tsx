"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Coupon = {
  id: string;
  code: string;
  durationDays: number;
  planType: string | null;
  planTier: string | null;
  createdAt: string;
  redeemedByOrg: string | null;
  redeemedByOrgName: string | null;
  redeemedAt: string | null;
};

const PLAN_OPTIONS = [
  { label: "Trial extension only (no plan change)", planType: null, planTier: null },
  { label: "Solo Pro — 1 user", planType: "PRO", planTier: "SOLO" },
  { label: "Team of 3 — up to 3 users", planType: "PRO", planTier: "TEAM_3" },
  { label: "Team of 5 — up to 5 users", planType: "PRO", planTier: "TEAM_5" },
  { label: "Enterprise", planType: "ENTERPRISE", planTier: "ENTERPRISE" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — select text manually as fallback
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy coupon code ${text}`}
      className="ml-2 px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loadError, setLoadError] = useState("");
  const [listLoading, setListLoading] = useState(true);

  const [duration, setDuration] = useState(30);
  const [customDuration, setCustomDuration] = useState("");
  const [count, setCount] = useState(1);
  const [planIdx, setPlanIdx] = useState(1); // default: Solo Pro
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [genSuccess, setGenSuccess] = useState<Coupon[]>([]);

  const DURATIONS = [30, 365];

  const loadCoupons = useCallback(async () => {
    setListLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/coupons?limit=100");
      if (!res.ok) throw new Error("Failed to load coupons");
      const data = await res.json();
      // API returns paginated response { data: [...], pagination: {...} }
      setCoupons(Array.isArray(data) ? data : (data.data ?? []));
    } catch {
      setLoadError("Failed to load coupons. Refresh to try again.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadCoupons(); }, [loadCoupons]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenError("");
    setGenSuccess([]);

    const effectiveDuration = duration === 0 ? parseInt(customDuration, 10) : duration;
    if (!effectiveDuration || effectiveDuration < 1 || effectiveDuration > 365) {
      setGenError("Enter a valid duration between 1 and 365 days.");
      return;
    }

    const selectedPlan = PLAN_OPTIONS[planIdx];

    setGenLoading(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationDays: effectiveDuration,
          count,
          planType: selectedPlan.planType,
          planTier: selectedPlan.planTier,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error?.message ?? "Failed to generate coupons.");
        return;
      }

      setGenSuccess(data);
      // Refresh list
      await loadCoupons();
    } catch {
      setGenError("Network error. Please try again.");
    } finally {
      setGenLoading(false);
    }
  }

  const unusedCount = coupons.filter((c) => !c.redeemedAt).length;
  const usedCount = coupons.filter((c) => c.redeemedAt).length;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <span className="font-bold text-lg">Super Admin</span>
        <span className="text-red-200 text-sm">Coupon Management</span>
        <div className="ml-auto flex gap-4">
          <Link href="/admin" className="text-sm text-red-200 hover:text-white transition">
            ← Admin Home
          </Link>
          <Link href="/dashboard" className="text-sm text-red-200 hover:text-white transition">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-8 max-w-5xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Coupons", value: coupons.length, color: "bg-white" },
            { label: "Available", value: unusedCount, color: "bg-green-50" },
            { label: "Used", value: usedCount, color: "bg-gray-50" },
          ].map((s) => (
            <div key={s.label} className={`${s.color} rounded-xl border border-gray-200 p-4`}>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Generate form */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-800 mb-4">Generate New Coupons</h2>

          {genSuccess.length > 0 && (
            <div
              role="status"
              className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg"
            >
              <p className="text-sm font-semibold text-green-800 mb-2">
                {genSuccess.length} coupon{genSuccess.length > 1 ? "s" : ""} generated:
              </p>
              <div className="space-y-1">
                {genSuccess.map((c) => (
                  <div key={c.id} className="flex items-center text-sm">
                    <code className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                      {c.code}
                    </code>
                    <span className="text-gray-500 ml-2 text-xs">({c.durationDays}d)</span>
                    <CopyButton text={c.code} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {genError && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
              {genError}
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-4" noValidate>
            {/* Plan selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Plan</label>
              <div className="flex flex-col gap-2">
                {PLAN_OPTIONS.map((p, i) => (
                  <label key={i} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="plan"
                      checked={planIdx === i}
                      onChange={() => setPlanIdx(i)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Duration selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Access Duration
              </label>
              <div className="flex gap-2 flex-wrap">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setDuration(d); setCustomDuration(""); setGenError(""); }}
                    aria-pressed={duration === d}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                      duration === d
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                    }`}
                  >
                    {d} day{d > 1 ? "s" : ""}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setDuration(0); setGenError(""); }}
                  aria-pressed={duration === 0}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                    duration === 0
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                  }`}
                >
                  Custom
                </button>
              </div>
              {duration === 0 && (
                <div className="mt-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    placeholder="e.g. 14"
                    aria-label="Custom duration in days"
                    className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-500">days</span>
                </div>
              )}
            </div>

            {/* Count */}
            <div>
              <label htmlFor="coupon-count" className="block text-sm font-medium text-gray-700 mb-1">
                Number of Coupons
              </label>
              <input
                id="coupon-count"
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Number of coupons to generate"
              />
            </div>

            <button
              type="submit"
              disabled={genLoading}
              aria-busy={genLoading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              {genLoading ? "Generating…" : "Generate"}
            </button>
          </form>
        </section>

        {/* Coupon list */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-800">All Coupons</h2>
            <button
              type="button"
              onClick={loadCoupons}
              className="text-xs text-blue-600 hover:text-blue-700 transition"
              aria-label="Refresh coupon list"
            >
              Refresh
            </button>
          </div>

          {loadError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm mb-4">
              {loadError}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm" aria-label="Coupon list">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs uppercase tracking-wide">Code</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs uppercase tracking-wide">Plan</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs uppercase tracking-wide">Duration</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs uppercase tracking-wide">Used By (Org)</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-semibold text-xs uppercase tracking-wide">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {listLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                      Loading…
                    </td>
                  </tr>
                ) : coupons.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                      No coupons yet. Generate your first one above.
                    </td>
                  </tr>
                ) : (
                  coupons.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <code className="font-mono font-bold text-gray-900 text-sm">{c.code}</code>
                          {!c.redeemedAt && <CopyButton text={c.code} />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {c.planTier ?? <span className="text-gray-400">Trial only</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.durationDays} day{c.durationDays !== 1 ? "s" : ""}
                      </td>
                      <td className="px-4 py-3">
                        {c.redeemedAt ? (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                            Used
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            Available
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {c.redeemedByOrgName
                          ? (
                            <div>
                              <p className="font-medium text-gray-700">{c.redeemedByOrgName}</p>
                              {c.redeemedAt && (
                                <p className="text-gray-400">{new Date(c.redeemedAt).toLocaleDateString("en-NP", { day: "2-digit", month: "short", year: "numeric" })}</p>
                              )}
                            </div>
                          )
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(c.createdAt).toLocaleDateString("en-NP", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
