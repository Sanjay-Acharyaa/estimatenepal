"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/format";
import { useConfirm } from "@/hooks/useConfirm";
import { CAT_COLORS, RESOURCE_CATEGORIES } from "@/lib/resource-constants";
import { LINE_TYPES } from "@/lib/line-types";
import { getWastageDefault } from "@/lib/wastageDefaults";

interface Resource {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitRate: number;
  wastagePercent: number;
}

interface AnalysisLine {
  id: string;
  lineType: string;
  qtyPerUnit: number;
  wastagePercent: number;
  notes: string | null;
  sortOrder: number;
  resource: Resource;
}

interface RateSettings {
  overheadPct: number;
  profitPct: number;
  contingencyPct: number;
  vatPct: number;
  leadLiftPct: number;
}

interface RateItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  baseRate: number;
}

interface Props {
  rate: RateItem;
  isAdmin: boolean;
  onClose: () => void;
  onRateUpdated?: (newRate: number) => void;
}




const NRS = (n: number) => fmtNum(n, 2);

export function ResourceLineAnalysis({ rate, isAdmin, onClose, onRateUpdated }: Props) {
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [lines, setLines] = useState<AnalysisLine[]>([]);
  const [settings, setSettings] = useState<RateSettings | null>(null);
  const [allResources, setAllResources] = useState<Resource[]>([]);

  const [loading, setLoading] = useState(true);
  const [updatingRate, setUpdatingRate] = useState(false);

  // Add line form
  const [showAddLine, setShowAddLine] = useState(false);
  const [addForm, setAddForm] = useState({
    resourceId: "",
    lineType: "MATERIAL" as typeof LINE_TYPES[number],
    qtyPerUnit: "",
    wastagePercent: "",
    notes: "",
  });
  const [addError, setAddError] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // Edit line state
  const [editLineId, setEditLineId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ qtyPerUnit: "", wastagePercent: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [deletingLine, setDeletingLine] = useState<string | null>(null);

  const loadLines = useCallback(async () => {
    try {
      const res = await fetch(`/api/rate-analysis-lines?rateItemId=${rate.id}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error?.message ?? "Failed to reload lines.");
        return;
      }
      const data = await res.json();
      setLines(data.lines ?? []);
    } catch {
      toast.error("Network error reloading lines.");
    }
  }, [rate.id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, sRes, rRes] = await Promise.all([
        fetch(`/api/rate-analysis-lines?rateItemId=${rate.id}`),
        fetch("/api/orgs/rate-settings"),
        fetch("/api/resources"),
      ]);
      if (!lRes.ok || !sRes.ok || !rRes.ok) {
        const failed = [lRes, sRes, rRes].find(r => !r.ok);
        const d = failed ? await failed.json().catch(() => ({})) : {};
        toast.error(d?.error?.message ?? "Failed to load rate analysis data.");
        setLines([]); setSettings(null);
        return;
      }
      const [lData, sData, rData] = await Promise.all([lRes.json(), sRes.json(), rRes.json()]);
      setLines(lData.lines ?? []);
      setSettings(sData.settings ?? null);
      setAllResources(rData.resources ?? []);
    } catch {
      toast.error("Network error loading rate analysis.");
      setLines([]); setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [rate.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Pre-fill wastage when resource is selected.
  // Prefer the resource library's own wastagePercent. If it is 0, fall back to the
  // keyword-based suggestion from getWastageDefault so the form is never left at 0
  // for materials that clearly have standard wastage allowances.
  useEffect(() => {
    if (!addForm.resourceId) return;
    const res = allResources.find(r => r.id === addForm.resourceId);
    if (res) {
      const suggested = res.wastagePercent > 0
        ? res.wastagePercent
        : (getWastageDefault(res.name)?.pct ?? 0);
      setAddForm(f => ({
        ...f,
        wastagePercent: String(suggested),
        lineType: res.category.startsWith("LABOUR")
          ? "LABOUR"
          : res.category === "EQUIPMENT"
          ? "EQUIPMENT"
          : "MATERIAL",
      }));
    }
  }, [addForm.resourceId, allResources]);

  // Compute totals
  const lineCost = (line: AnalysisLine) => {
    const w = 1 + (line.wastagePercent / 100);
    return line.qtyPerUnit * line.resource.unitRate * w;
  };

  const subtotalMaterial = lines
    .filter(l => l.lineType === "MATERIAL")
    .reduce((s, l) => s + lineCost(l), 0);
  const subtotalLabour = lines
    .filter(l => l.lineType === "LABOUR")
    .reduce((s, l) => s + lineCost(l), 0);
  const subtotalEquipment = lines
    .filter(l => l.lineType === "EQUIPMENT")
    .reduce((s, l) => s + lineCost(l), 0);
  const subtotalOther = lines
    .filter(l => l.lineType === "OTHER")
    .reduce((s, l) => s + lineCost(l), 0);

  const directCost = subtotalMaterial + subtotalLabour + subtotalEquipment + subtotalOther;

  const overhead = settings ? directCost * (settings.overheadPct / 100) : 0;
  const profit = settings ? (directCost + overhead) * (settings.profitPct / 100) : 0;
  const contingency = settings ? (directCost + overhead + profit) * (settings.contingencyPct / 100) : 0;
  const leadLift = settings ? (directCost + overhead) * (settings.leadLiftPct / 100) : 0;
  const preVat = directCost + overhead + profit + contingency + leadLift;
  const vat = settings ? preVat * (settings.vatPct / 100) : 0;
  const totalRate = preVat + vat;

  const addLine = async () => {
    const qty = parseFloat(addForm.qtyPerUnit);
    const wastage = parseFloat(addForm.wastagePercent);
    if (!addForm.resourceId) { setAddError("Select a resource."); return; }
    if (isNaN(qty) || qty < 0) { setAddError("Valid quantity is required."); return; }
    if (isNaN(wastage)) { setAddError("Valid wastage % is required."); return; }

    setAddSaving(true); setAddError("");
    try {
      const res = await fetch("/api/rate-analysis-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateItemId: rate.id,
          resourceId: addForm.resourceId,
          lineType: addForm.lineType,
          qtyPerUnit: qty,
          wastagePercent: wastage,
          notes: addForm.notes.trim() || null,
          sortOrder: lines.length,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message ?? d.error ?? "Failed to add line");
      }
      toast.success("Line added.");
      setShowAddLine(false);
      setAddForm({ resourceId: "", lineType: "MATERIAL", qtyPerUnit: "", wastagePercent: "", notes: "" });
      loadLines();
    } catch (e: any) {
      setAddError(e.message ?? "Failed.");
    } finally {
      setAddSaving(false);
    }
  };

  const startEdit = (line: AnalysisLine) => {
    setEditLineId(line.id);
    setEditForm({
      qtyPerUnit: String(line.qtyPerUnit),
      wastagePercent: String(line.wastagePercent),
      notes: line.notes ?? "",
    });
  };

  const saveEdit = async (lineId: string) => {
    const qty = parseFloat(editForm.qtyPerUnit);
    const wastage = parseFloat(editForm.wastagePercent);
    if (isNaN(qty) || qty < 0 || isNaN(wastage)) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/rate-analysis-lines/${lineId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qtyPerUnit: qty,
          wastagePercent: wastage,
          notes: editForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error?.message ?? "Failed to save line.");
        return;
      }
      setEditLineId(null);
      loadLines();
    } catch {
      toast.error("Network error. Change not saved.");
    } finally {
      setEditSaving(false);
    }
  };

  const deleteLine = async (line: AnalysisLine) => {
    const ok = await confirm({
      title: "Remove Line",
      message: `Remove "${line.resource.name}" from this analysis?`,
      variant: "danger",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setDeletingLine(line.id);
    try {
      const res = await fetch(`/api/rate-analysis-lines/${line.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error?.message ?? "Failed to remove line.");
        return;
      }
      loadLines();
    } finally {
      setDeletingLine(null);
    }
  };

  const updateBaseRate = async () => {
    // Apply the pre-VAT rate only. VAT is applied separately at the project/BOQ level.
    // Writing totalRate (which includes VAT) would cause VAT to be counted twice in
    // any project that has vatEnabled = true.
    if (preVat <= 0) return;
    const ok = await confirm({
      title: "Update Base Rate",
      message: `Set the base rate of "${rate.code}" to NRS ${NRS(preVat)} (pre-VAT)? VAT is applied separately at the BOQ level. Current rate is NRS ${NRS(rate.baseRate)}.`,
      variant: "default",
      confirmLabel: "Update Rate",
    });
    if (!ok) return;
    setUpdatingRate(true);
    try {
      const res = await fetch(`/api/rates/${rate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRate: preVat }),
      });
      if (res.ok) {
        toast.success(`Base rate updated to NRS ${NRS(preVat)} (pre-VAT).`);
        onRateUpdated?.(preVat);
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error?.message ?? "Failed to update rate.");
      }
    } finally {
      setUpdatingRate(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {confirmDialog}
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{rate.code}</span>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{rate.description.slice(0, 80)}</h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Resource-based analysis per {rate.unit} &middot; Current base rate: NRS {NRS(rate.baseRate)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm font-medium flex-shrink-0 ml-3 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">Close</button>
        </div>

        {/* Org settings summary bar */}
        {settings && (
          <div className="px-6 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Overhead <span className="font-medium text-gray-700 dark:text-gray-300">{settings.overheadPct}%</span>
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Profit <span className="font-medium text-gray-700 dark:text-gray-300">{settings.profitPct}%</span>
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Contingency <span className="font-medium text-gray-700 dark:text-gray-300">{settings.contingencyPct}%</span>
            </span>
            {settings.leadLiftPct > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Lead & Lift <span className="font-medium text-gray-700 dark:text-gray-300">{settings.leadLiftPct}%</span>
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              VAT <span className="font-medium text-gray-700 dark:text-gray-300">{settings.vatPct}%</span>
            </span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-600 dark:text-gray-400 text-sm">Loading…</span>
            </div>
          ) : (
            <>
              {allResources.length === 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
                  Your Resource Library is empty. Go to the Resource Library tab and add resources before building a rate analysis.
                </div>
              )}

              {/* Lines table */}
              {lines.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400">Resource</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-gray-500 dark:text-gray-400 w-20">Type</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 w-24">Qty/Unit</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 w-24">Rate</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 w-20">Wastage</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 w-28">Amount</th>
                        {isAdmin && <th className="px-3 py-2.5 w-20" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {lines.map(line => (
                        <tr key={line.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-3 py-2.5">
                            <p className="text-gray-800 dark:text-gray-200 font-medium">{line.resource.name}</p>
                            <span className={`mt-0.5 inline-flex text-xs px-1.5 py-0.5 rounded-full font-medium ${CAT_COLORS[line.resource.category] ?? "bg-gray-100 text-gray-600"}`}>
                              {line.resource.category.replace(/_/g, " ")}
                            </span>
                            {line.notes && <p className="text-gray-400 dark:text-gray-500 mt-0.5">{line.notes}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-center text-gray-600 dark:text-gray-400">{line.lineType}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-800 dark:text-gray-200">
                            {editLineId === line.id ? (
                              <input
                                type="number"
                                min="0"
                                step="0.001"
                                value={editForm.qtyPerUnit}
                                onChange={e => setEditForm(f => ({ ...f, qtyPerUnit: e.target.value }))}
                                className="w-20 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 text-right text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            ) : (
                              <span>{fmtNum(line.qtyPerUnit, 4)} {line.resource.unit}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                            {NRS(line.resource.unitRate)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-800 dark:text-gray-200">
                            {editLineId === line.id ? (
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={editForm.wastagePercent}
                                onChange={e => setEditForm(f => ({ ...f, wastagePercent: e.target.value }))}
                                className="w-16 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 text-right text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            ) : (
                              <span>{line.wastagePercent}%</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                            {NRS(lineCost(line))}
                          </td>
                          {isAdmin && (
                            <td className="px-3 py-2.5">
                              {editLineId === line.id ? (
                                <div className="flex gap-1 justify-end">
                                  <button
                                    onClick={() => saveEdit(line.id)}
                                    disabled={editSaving}
                                    className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded disabled:opacity-50"
                                  >
                                    {editSaving ? "…" : "Save"}
                                  </button>
                                  <button
                                    onClick={() => setEditLineId(null)}
                                    className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-1 justify-end">
                                  <button
                                    onClick={() => startEdit(line)}
                                    className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => deleteLine(line)}
                                    disabled={deletingLine === line.id}
                                    className="px-2 py-0.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-40"
                                  >
                                    {deletingLine === line.id ? "…" : "Delete"}
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 text-sm">
                  No analysis lines yet. Add resource lines to build up this rate.
                </div>
              )}

              {/* Add line form */}
              {isAdmin && showAddLine ? (
                <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Add Resource Line</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Resource</label>
                      <select
                        value={addForm.resourceId}
                        onChange={e => setAddForm(f => ({ ...f, resourceId: e.target.value }))}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select resource…</option>
                        {RESOURCE_CATEGORIES.map(({ value, label }) => {
                          const catResources = allResources.filter(r => r.category === value);
                          if (catResources.length === 0) return null;
                          return (
                            <optgroup key={value} label={label}>
                              {catResources.map(r => (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({r.unit}) - NRS {NRS(r.unitRate)}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Line Type</label>
                      <select
                        value={addForm.lineType}
                        onChange={e => setAddForm(f => ({ ...f, lineType: e.target.value as typeof LINE_TYPES[number] }))}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {LINE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Qty per {rate.unit || "unit"}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={addForm.qtyPerUnit}
                        onChange={e => setAddForm(f => ({ ...f, qtyPerUnit: e.target.value }))}
                        placeholder="0.000"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Wastage %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={addForm.wastagePercent}
                        onChange={e => setAddForm(f => ({ ...f, wastagePercent: e.target.value }))}
                        placeholder="0"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
                      <input
                        value={addForm.notes}
                        onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="e.g. for 1:4 mortar"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  {addError && <p className="text-red-600 dark:text-red-400 text-xs">{addError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={addLine}
                      disabled={addSaving}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {addSaving ? "Adding…" : "Add Line"}
                    </button>
                    <button
                      onClick={() => { setShowAddLine(false); setAddError(""); }}
                      className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : isAdmin && allResources.length > 0 ? (
                <button
                  onClick={() => setShowAddLine(true)}
                  className="w-full py-2 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-2 border-dashed border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                >
                  + Add Resource Line
                </button>
              ) : null}

              {/* Cost breakdown */}
              {lines.length > 0 && settings && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Cost Breakdown
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {subtotalMaterial > 0 && (
                      <div className="flex justify-between px-4 py-2 text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Materials</span>
                        <span className="tabular-nums font-medium text-gray-800 dark:text-gray-200">NRS {NRS(subtotalMaterial)}</span>
                      </div>
                    )}
                    {subtotalLabour > 0 && (
                      <div className="flex justify-between px-4 py-2 text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Labour</span>
                        <span className="tabular-nums font-medium text-gray-800 dark:text-gray-200">NRS {NRS(subtotalLabour)}</span>
                      </div>
                    )}
                    {subtotalEquipment > 0 && (
                      <div className="flex justify-between px-4 py-2 text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Equipment</span>
                        <span className="tabular-nums font-medium text-gray-800 dark:text-gray-200">NRS {NRS(subtotalEquipment)}</span>
                      </div>
                    )}
                    {subtotalOther > 0 && (
                      <div className="flex justify-between px-4 py-2 text-xs">
                        <span className="text-gray-600 dark:text-gray-400">Other</span>
                        <span className="tabular-nums font-medium text-gray-800 dark:text-gray-200">NRS {NRS(subtotalOther)}</span>
                      </div>
                    )}
                    <div className="flex justify-between px-4 py-2 text-xs font-semibold bg-gray-50 dark:bg-gray-800">
                      <span className="text-gray-700 dark:text-gray-300">Direct Cost</span>
                      <span className="tabular-nums text-gray-900 dark:text-gray-100">NRS {NRS(directCost)}</span>
                    </div>
                    {overhead > 0 && (
                      <div className="flex justify-between px-4 py-2 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">+ Overhead ({settings.overheadPct}%)</span>
                        <span className="tabular-nums text-gray-600 dark:text-gray-300">NRS {NRS(overhead)}</span>
                      </div>
                    )}
                    {profit > 0 && (
                      <div className="flex justify-between px-4 py-2 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">+ Profit ({settings.profitPct}%)</span>
                        <span className="tabular-nums text-gray-600 dark:text-gray-300">NRS {NRS(profit)}</span>
                      </div>
                    )}
                    {contingency > 0 && (
                      <div className="flex justify-between px-4 py-2 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">+ Contingency ({settings.contingencyPct}%)</span>
                        <span className="tabular-nums text-gray-600 dark:text-gray-300">NRS {NRS(contingency)}</span>
                      </div>
                    )}
                    {leadLift > 0 && (
                      <div className="flex justify-between px-4 py-2 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">+ Lead and Lift ({settings.leadLiftPct}%)</span>
                        <span className="tabular-nums text-gray-600 dark:text-gray-300">NRS {NRS(leadLift)}</span>
                      </div>
                    )}
                    <div className="flex justify-between px-4 py-2.5 bg-green-50 dark:bg-green-900/20 border-t border-green-200 dark:border-green-800">
                      <span className="text-xs font-bold text-green-900 dark:text-green-300">Rate for BOQ (pre-VAT)</span>
                      <span className="text-xs font-bold text-green-900 dark:text-green-300 tabular-nums">NRS {NRS(preVat)}</span>
                    </div>
                    {vat > 0 && (
                      <div className="flex justify-between px-4 py-2 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">+ VAT ({settings.vatPct}%) — applied at BOQ level</span>
                        <span className="tabular-nums text-gray-600 dark:text-gray-300">NRS {NRS(vat)}</span>
                      </div>
                    )}
                    <div className="flex justify-between px-4 py-3 bg-blue-50 dark:bg-blue-900/20">
                      <span className="text-sm font-bold text-blue-900 dark:text-blue-300">Total Rate (incl. VAT) per {rate.unit}</span>
                      <span className="text-sm font-bold text-blue-900 dark:text-blue-300 tabular-nums">NRS {NRS(totalRate)}</span>
                    </div>
                    {contingency > 0 && (
                      <div className="px-4 py-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800">
                        This rate includes {settings.contingencyPct}% contingency. If your project also applies a contingency percentage at the BOQ level, contingency will be counted twice. Set the project contingency to 0% if it is already included here.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {lines.length > 0 && settings ? (
              <>Pre-VAT rate: <span className="font-semibold text-gray-800 dark:text-gray-200">NRS {NRS(preVat)}</span> per {rate.unit}</>
            ) : (
              "Add resource lines to compute the rate"
            )}
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && lines.length > 0 && settings && preVat <= 0 && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Rate is zero — add quantities to resource lines to enable applying the rate.
              </span>
            )}
            {isAdmin && lines.length > 0 && settings && preVat > 0 && (
              <button
                onClick={updateBaseRate}
                disabled={updatingRate}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {updatingRate ? "Updating…" : "Apply to Base Rate"}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
