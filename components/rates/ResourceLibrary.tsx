"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";
import { fmtNum } from "@/lib/format";
import { RESOURCE_CATEGORIES, CAT_COLORS } from "@/lib/resource-constants";

interface OrgResource {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitRate: number;
  wastagePercent: number;
  notes: string | null;
  isDefault: boolean;
  priceUpdatedAt: string | null;
}

const BLANK_FORM = {
  name: "", category: "CEMENT", unit: "bag", unitRate: "", wastagePercent: "0", notes: "",
};

const CATEGORY_DEFAULT_UNIT: Record<string, string> = {
  CEMENT: "bag",
  FINE_AGGREGATE: "cft",
  COARSE_AGGREGATE: "cft",
  MASONRY: "nos",
  STEEL: "kg",
  TIMBER: "cft",
  LABOUR_SKILLED: "day",
  LABOUR_UNSKILLED: "day",
  EQUIPMENT: "hour",
  OTHER: "unit",
};

const CATEGORY_DEFAULT_WASTAGE: Record<string, string> = {
  CEMENT: "3",
  FINE_AGGREGATE: "5",
  COARSE_AGGREGATE: "5",
  MASONRY: "5",
  STEEL: "3",
  TIMBER: "10",
  LABOUR_SKILLED: "0",
  LABOUR_UNSKILLED: "0",
  EQUIPMENT: "0",
  OTHER: "0",
};

export function ResourceLibrary({ isAdmin }: { isAdmin: boolean }) {
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [resources, setResources] = useState<OrgResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>("");
  const [seeding, setSeeding] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<OrgResource | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  // When category changes on a NEW resource form (not edit), auto-update unit and wastage defaults.
  useEffect(() => {
    if (editTarget) return;
    setForm(f => ({
      ...f,
      unit: CATEGORY_DEFAULT_UNIT[f.category] ?? "unit",
      wastagePercent: CATEGORY_DEFAULT_WASTAGE[f.category] ?? "0",
    }));
  }, [form.category, editTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always fetch all resources once; category filtering happens client-side.
  // This eliminates a new API round-trip on every filter pill click.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/resources");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error?.message ?? `Failed to load resources (${res.status}).`);
        setResources([]);
        return;
      }
      const data = await res.json();
      setResources(data.resources ?? []);
    } catch {
      toast.error("Network error loading resources.");
      setResources([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...BLANK_FORM });
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (r: OrgResource) => {
    setEditTarget(r);
    setForm({
      name: r.name,
      category: r.category,
      unit: r.unit,
      unitRate: String(r.unitRate),
      wastagePercent: String(r.wastagePercent),
      notes: r.notes ?? "",
    });
    setFormError("");
    setShowForm(true);
  };

  const saveResource = async () => {
    const unitRate = parseFloat(form.unitRate);
    const wastagePercent = parseFloat(form.wastagePercent);
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    if (isNaN(unitRate) || unitRate < 0) { setFormError("Valid unit rate is required."); return; }
    if (isNaN(wastagePercent)) { setFormError("Valid wastage % is required."); return; }

    setSaving(true); setFormError("");
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        unit: form.unit.trim(),
        unitRate,
        wastagePercent,
        notes: form.notes.trim() || null,
      };

      const url = editTarget ? `/api/resources/${editTarget.id}` : "/api/resources";
      const method = editTarget ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message ?? d.error ?? "Failed to save");
      }
      toast.success(editTarget ? "Resource updated." : "Resource added.");
      setShowForm(false);
      load();
    } catch (e: any) {
      setFormError(e.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const deleteResource = async (r: OrgResource) => {
    const ok = await confirm({
      title: "Delete Resource",
      message: `Delete "${r.name}"? This cannot be undone. Resources used in rate analysis lines cannot be deleted.`,
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setDeleting(r.id);
    try {
      const res = await fetch(`/api/resources/${r.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error?.message ?? d.error ?? "Cannot delete this resource.");
        return;
      }
      toast.success("Resource deleted.");
      load();
    } finally {
      setDeleting(null);
    }
  };

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/resources/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? "Failed to seed defaults.");
      } else {
        toast.success(`${data.seeded} default resources added (${data.skipped} already existed).`);
        load();
      }
    } finally {
      setSeeding(false);
    }
  };

  const searchLower = search.toLowerCase().trim();

  // Apply both category filter and text search client-side from the full list
  const filteredResources = resources.filter(r => {
    const matchesCat = filterCat ? r.category === filterCat : true;
    const matchesSearch = searchLower
      ? r.name.toLowerCase().includes(searchLower) || (r.notes ?? "").toLowerCase().includes(searchLower)
      : true;
    return matchesCat && matchesSearch;
  });

  // Counts per category from full unfiltered list (for pill badges) - single pass O(n)
  const catCounts = resources.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});

  const grouped = filteredResources.reduce<Record<string, OrgResource[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  function fmtDate(iso: string | null): string {
    if (!iso) return "--";
    const d = new Date(iso);
    const months = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (months < 1) return "This month";
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    return `${years}yr ago`;
  }

  function priceAgeClass(iso: string | null): string {
    if (!iso) return "text-gray-400";
    const months = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (months >= 12) return "text-red-500";
    if (months >= 6) return "text-amber-500";
    return "text-gray-400";
  }

  return (
    <div className="space-y-4">
      {confirmDialog}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">Resource Library</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage your organisation's standard materials, labour, and equipment rates used in rate analysis.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && resources.length === 0 && (
            <button
              onClick={seedDefaults}
              disabled={seeding}
              className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition disabled:opacity-50"
            >
              {seeding ? "Loading defaults…" : "Load Nepal defaults"}
            </button>
          )}
          {isAdmin && resources.length > 0 && (
            <button
              onClick={seedDefaults}
              disabled={seeding}
              className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
            >
              {seeding ? "Checking…" : "+ Seed missing defaults"}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={openCreate}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              + Add Resource
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      {resources.length > 0 && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or notes..."
          className="w-full max-w-sm text-sm px-3 py-1.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilterCat("")}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${filterCat === "" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          All ({resources.length})
        </button>
        {RESOURCE_CATEGORIES.map(cat => {
          const count = catCounts[cat.value] ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={cat.value}
              onClick={() => setFilterCat(filterCat === cat.value ? "" : cat.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${filterCat === cat.value ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600 text-sm">Loading…</span>
        </div>
      ) : resources.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-gray-700 font-medium text-sm">No resources yet</p>
          <p className="text-gray-500 text-xs mt-1">Load Nepal defaults or add resources manually.</p>
          {isAdmin && (
            <button
              onClick={seedDefaults}
              disabled={seeding}
              className="mt-3 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {seeding ? "Loading…" : "Load Nepal Defaults"}
            </button>
          )}
        </div>
      ) : filteredResources.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No resources match your search.
        </div>
      ) : (
        <div className="space-y-4">
          {RESOURCE_CATEGORIES.filter(cat => (grouped[cat.value]?.length ?? 0) > 0).map(cat => (
            <div key={cat.value}>
              <p className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold mb-2 ${CAT_COLORS[cat.value]}`}>
                {cat.label}
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Name</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 w-16">Unit</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 w-28">Rate (NRS)</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 w-20">Wastage %</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 w-24" title="When the unit rate was last updated">Rate Updated</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-36">Notes</th>
                      {isAdmin && <th className="px-3 py-2.5 w-24" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grouped[cat.value].map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 text-gray-800 text-xs">
                          {r.name}
                          {r.isDefault && (
                            <span className="ml-1.5 text-gray-400 text-[10px]">(default)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-600 text-xs">{r.unit}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-gray-800 tabular-nums">
                          {fmtNum(r.unitRate, 2)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-600 text-xs tabular-nums">
                          {r.wastagePercent}%
                        </td>
                        <td className={`px-3 py-2.5 text-right text-xs tabular-nums ${priceAgeClass(r.priceUpdatedAt)}`}
                            title={r.priceUpdatedAt ? `Rate set on ${new Date(r.priceUpdatedAt).toLocaleDateString()}` : "Never updated"}>
                          {fmtDate(r.priceUpdatedAt)}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs truncate max-w-xs">
                          {r.notes}
                        </td>
                        {isAdmin && (
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => openEdit(r)}
                                className="px-2 py-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteResource(r)}
                                disabled={deleting === r.id}
                                className="px-2 py-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded disabled:opacity-40"
                              >
                                {deleting === r.id ? "..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onKeyDown={e => { if (e.key === "Escape") setShowForm(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                {editTarget ? "Edit Resource" : "Add Resource"}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-800 text-sm font-medium px-2 py-1 rounded hover:bg-gray-100">Close</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. PPC Cement (Bag 50kg)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RESOURCE_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Unit <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="e.g. bag, kg, day, cft"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Unit Rate (NRS) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unitRate}
                    onChange={e => setForm(f => ({ ...f, unitRate: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Wastage %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={form.wastagePercent}
                    onChange={e => setForm(f => ({ ...f, wastagePercent: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
                <input
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Grade, brand, supplier note…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {formError && <p className="text-red-500 text-sm">{formError}</p>}
            </div>
            <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveResource}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : editTarget ? "Update" : "Add Resource"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
