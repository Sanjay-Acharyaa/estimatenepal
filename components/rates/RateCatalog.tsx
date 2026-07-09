"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";
import { RateForm } from "./RateForm";
import { RateAnalysisBuilder } from "./RateAnalysisBuilder";
import { fmtNum } from "@/lib/format";

interface RateBatch {
  id: string;
  name: string;
  type: string;
  itemCount: number;
  fiscalYear: string;
  createdAt: string;
}

interface RateItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  baseRate: number;
  source: "DUDBC" | "DISTRICT" | "CUSTOM";
  fiscalYear: string;
  batchId: string | null;
  orgId: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Props {
  isAdmin: boolean;
  projectId?: string;
}

const TYPE_COLORS: Record<string, string> = {
  CUSTOM:   "bg-blue-100 text-blue-700 border-blue-200",
  DISTRICT: "bg-orange-100 text-orange-700 border-orange-200",
};

const SOURCE_BADGE: Record<string, string> = {
  DUDBC:    "bg-green-100 text-green-700",
  DISTRICT: "bg-yellow-100 text-yellow-700",
  CUSTOM:   "bg-blue-100 text-blue-700",
};

export function RateCatalog({ isAdmin, projectId }: Props) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [batches, setBatches] = useState<RateBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | "all">("all");
  const [rates, setRates] = useState<RateItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<RateItem | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<RateItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [unbatchedCount, setUnbatchedCount] = useState(0);
  const [renamingBatchId, setRenamingBatchId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Save as Assembly state — Map<id, RateItem> so the full object is available across page navigations
  const [selectedRateIds, setSelectedRateIds] = useState<Map<string, RateItem>>(new Map());
  const [showSaveAsAssembly, setShowSaveAsAssembly] = useState(false);
  const [assemblyForm, setAssemblyForm] = useState({ name: "", description: "", category: "" });
  const [savingAssembly, setSavingAssembly] = useState(false);

  // Import state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importBatchName, setImportBatchName] = useState("");
  const [importBatchType, setImportBatchType] = useState<"CUSTOM" | "DISTRICT">("CUSTOM");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; batchName: string; message: string } | null>(null);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/rate-batches");
      const data = await res.json();
      setBatches(Array.isArray(data) ? data : []);
    } catch { setBatches([]); }
  }, []);

  // Count unbatched rates (imported before Rate Books existed)
  const loadUnbatchedCount = useCallback(async () => {
    try {
      const res = await fetch("/api/rates?batchId=none&limit=1");
      const data = await res.json();
      setUnbatchedCount(data.pagination?.total ?? 0);
    } catch { setUnbatchedCount(0); }
  }, []);

  useEffect(() => { loadBatches(); loadUnbatchedCount(); }, [loadBatches, loadUnbatchedCount]);

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(page), limit: "30" });
      if (search) sp.set("search", search);
      if (selectedBatchId !== "all") sp.set("batchId", selectedBatchId);
      const res = await fetch(`/api/rates?${sp}`);
      const data = await res.json();
      setRates(data.data ?? []);
      setPagination(data.pagination ?? null);
    } catch { setRates([]); }
    finally { setLoading(false); }
  }, [page, search, selectedBatchId]);

  useEffect(() => { loadRates(); }, [loadRates]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    if (!importBatchName) {
      setImportBatchName(file.name.replace(/\.(xlsx|xls)$/i, ""));
    }
    setShowImportDialog(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runImport = async () => {
    if (!importFile || !importBatchName.trim()) return;
    setImporting(true); setImportError(""); setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", importFile);
      form.append("batchName", importBatchName.trim());
      form.append("batchType", importBatchType);
      const res = await fetch("/api/rates/import", { method: "POST", body: form });

      // Parse JSON safely — server may return HTML on 502/session-expiry
      let data: any = {};
      try { data = await res.json(); } catch {
        setImportError(`Server returned an unexpected response (HTTP ${res.status}). Please refresh the page and try again.`);
        return;
      }

      if (!res.ok) {
        // data.error may be a string (rate-limit) or an object with .message + .errors
        const msg = typeof data.error === "string"
          ? data.error
          : (data.error?.message ?? `Import failed (HTTP ${res.status}).`);
        const errs = data.error?.errors as string[] | undefined;
        setImportError(msg + (errs?.length ? "\n" + errs.slice(0, 5).join("\n") : ""));
      } else {
        setImportResult(data);
        setShowImportDialog(false);
        setImportFile(null);
        setImportBatchName("");
        loadBatches();
        setSelectedBatchId(data.batchId ?? "all");
        loadRates();
      }
    } catch (err) {
      setImportError(err instanceof TypeError
        ? "Could not reach the server. Check your connection and try again."
        : "Unexpected error. Please refresh and try again.");
    } finally { setImporting(false); }
  };

  const deleteAll = async (batchId: string | "all" | "none", label: string, count: number) => {
    const ok = await confirm({
      title: "Delete All Rates",
      message: `Delete all ${count} rate${count !== 1 ? "s" : ""} in "${label}"? Takeoff groups linked to these rates will be unlinked. This cannot be undone.`,
      variant: "danger", confirmLabel: "Delete All",
    });
    if (!ok) return;
    setDeletingBatch(batchId);
    try {
      const param = batchId === "all" ? "" : batchId === "none" ? "?batchId=none" : `?batchId=${batchId}`;
      await fetch(`/api/rates/delete-all${param}`, { method: "DELETE" });
      if (selectedBatchId === batchId) setSelectedBatchId("all");
      loadBatches(); loadUnbatchedCount(); loadRates();
      toast.success("Rates deleted.");
    } finally { setDeletingBatch(null); }
  };

  const deleteBatch = async (batch: RateBatch) => {
    const ok = await confirm({
      title: "Delete Rate Book",
      message: `Delete rate book "${batch.name}"? This will remove all ${batch.itemCount} rates. Takeoff groups linked to these rates will be unlinked. This cannot be undone.`,
      variant: "danger", confirmLabel: "Delete",
    });
    if (!ok) return;
    setDeletingBatch(batch.id);
    try {
      await fetch(`/api/rate-batches/${batch.id}`, { method: "DELETE" });
      if (selectedBatchId === batch.id) setSelectedBatchId("all");
      loadBatches(); loadRates();
      toast.success("Rate book deleted.");
    } finally { setDeletingBatch(null); }
  };

  const renameBatch = async (batchId: string) => {
    if (!renameValue.trim()) { setRenamingBatchId(null); return; }
    await fetch(`/api/rate-batches/${batchId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    setRenamingBatchId(null);
    loadBatches();
  };

  const createRate = async (data: any) => {
    const res = await fetch("/api/rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error?.message ?? "Failed to create");
    }
    setShowCreate(false);
    loadRates();
    loadBatches();
  };

  const updateRate = async (data: any) => {
    if (!editTarget) return;
    const res = await fetch(`/api/rates/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error?.message ?? "Failed"); }
    setEditTarget(null);
    loadRates();
  };

  const deleteRate = async (rate: RateItem) => {
    const ok = await confirm({ title: "Delete Rate", message: `Delete "${rate.code} — ${rate.description.slice(0, 60)}"?`, variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    setDeleting(rate.id);
    try { await fetch(`/api/rates/${rate.id}`, { method: "DELETE" }); loadRates(); loadBatches(); toast.success("Rate deleted."); }
    finally { setDeleting(null); }
  };

  function unitToGroupType(unit: string): string {
    const u = unit.toLowerCase().replace(/[\s.]/g, "");
    if (/^(sqft|sqm|sq|m2|ft2|sf|sft)/.test(u)) return "AREA";
    if (/^(cum|cft|m3|ft3|ccm)/.test(u)) return "VOLUME";
    if (/^(each|no|nos|ea|pcs|piece|nr|item|set|unit|lump)/.test(u)) return "COUNT";
    if (/^(rft|rm|lft|lm|ml|km|lin|meter|metre)/.test(u) || u === "m" || u === "ft") return "LINEAR";
    return "LINEAR";
  }

  async function handleSaveAsAssembly() {
    const selectedRates = Array.from(selectedRateIds.values());
    if (!selectedRates.length || !assemblyForm.name.trim()) return;
    setSavingAssembly(true);
    try {
      const groups = selectedRates.map((r, i) => ({
        name: r.description.slice(0, 100).trim() || r.code,
        type: unitToGroupType(r.unit),
        colour: "#3B82F6",
        lineWidth: 2,
        rateCode: r.code.slice(0, 50),
        sortOrder: i,
        children: [],
      }));
      const res = await fetch("/api/assemblies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: assemblyForm.name.trim(), description: assemblyForm.description || undefined, category: assemblyForm.category || undefined, groups }),
      });
      if (res.ok) {
        toast.success(`Assembly "${assemblyForm.name}" saved to your library.`);
        setShowSaveAsAssembly(false);
        setSelectedRateIds(new Map());
        setAssemblyForm({ name: "", description: "", category: "" });
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error?.message ?? "Failed to save assembly.");
      }
    } catch {
      toast.error("Could not reach the server. Check your connection.");
    } finally {
      setSavingAssembly(false);
    }
  }

  // Use live pagination total when on "All Rates" so unbatched legacy rates are counted
  const totalRates = selectedBatchId === "all"
    ? (pagination?.total ?? batches.reduce((s, b) => s + b.itemCount, 0))
    : batches.reduce((s, b) => s + b.itemCount, 0);

  return (
    <div className="flex flex-col sm:flex-row gap-5 min-h-96">
      {confirmDialog}

      {/* Floating selection bar */}
      {selectedRateIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl">
          <span className="text-sm font-medium">{selectedRateIds.size} rate{selectedRateIds.size !== 1 ? "s" : ""} selected</span>
          <button onClick={() => setShowSaveAsAssembly(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition">
            Save as Assembly
          </button>
          <button onClick={() => setSelectedRateIds(new Map())} className="text-gray-600 hover:text-white text-sm">✕ Clear</button>
        </div>
      )}

      {/* Save as Assembly modal */}
      {showSaveAsAssembly && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-assembly-title"
          onKeyDown={e => { if (e.key === "Escape") setShowSaveAsAssembly(false); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 id="save-assembly-title" className="font-semibold text-gray-800 mb-1">Save as Assembly</h3>
            <p className="text-sm text-gray-500 mb-4">
              {selectedRateIds.size} rate item{selectedRateIds.size !== 1 ? "s" : ""} will be saved as layers. Units are auto-mapped to measurement types.
            </p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Assembly name <span className="text-red-500">*</span></label>
                <input value={assemblyForm.name} onChange={e => setAssemblyForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Standard Road Subbase" autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select value={assemblyForm.category} onChange={e => setAssemblyForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">— None —</option>
                  {["Structural","Civil","MEP","Architectural","Road","Irrigation"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <input value={assemblyForm.description} onChange={e => setAssemblyForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSaveAsAssembly} disabled={savingAssembly || !assemblyForm.name.trim()}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded-lg text-sm transition disabled:opacity-50">
                {savingAssembly ? "Saving…" : "Save Assembly"}
              </button>
              <button onClick={() => setShowSaveAsAssembly(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Left: Rate Books sidebar ── */}
      <div className="w-full sm:w-64 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate Books</p>
          <a href="/api/rates/template" download
            className="text-xs text-blue-600 hover:underline">↓ Template</a>
        </div>

        {/* All rates */}
        <button
          onClick={() => { setSelectedBatchId("all"); setPage(1); }}
          className={`w-full text-left px-3 py-2.5 rounded-lg border transition text-sm ${
            selectedBatchId === "all"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">All Rates</span>
            <span className={`text-xs ${selectedBatchId === "all" ? "text-gray-300" : "text-gray-600"}`}>
              {totalRates}
            </span>
          </div>
        </button>

        {/* Unbatched rates (imported before Rate Books) */}
        {unbatchedCount > 0 && (
          <div className={`rounded-lg border transition ${
            selectedBatchId === "none"
              ? "border-amber-400 bg-amber-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}>
            <button
              onClick={() => { setSelectedBatchId("none"); setPage(1); }}
              className="w-full text-left px-3 py-2.5"
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${selectedBatchId === "none" ? "text-amber-800" : "text-gray-700"}`}>
                  Unbatched Rates
                </span>
                <span className="text-xs text-amber-600 font-bold">{unbatchedCount}</span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">Imported before Rate Books</p>
            </button>
            {isAdmin && (
              <div className="border-t border-gray-100">
                <button
                  onClick={() => deleteAll("none", "Unbatched Rates", unbatchedCount)}
                  disabled={deletingBatch === "none"}
                  className="w-full py-1.5 text-xs text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                >
                  {deletingBatch === "none" ? "Deleting…" : `🗑 Delete all ${unbatchedCount}`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Batch cards */}
        {batches.map(batch => (
          <div key={batch.id}
            className={`rounded-lg border transition ${
              selectedBatchId === batch.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <button
              onClick={() => { setSelectedBatchId(batch.id); setPage(1); }}
              className="w-full text-left px-3 py-2.5"
            >
              {renamingBatchId === batch.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => renameBatch(batch.id)}
                  onKeyDown={e => {
                    if (e.key === "Enter") renameBatch(batch.id);
                    if (e.key === "Escape") setRenamingBatchId(null);
                  }}
                  onClick={e => e.stopPropagation()}
                  className="w-full text-sm border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none"
                />
              ) : (
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-sm font-medium truncate flex-1 ${selectedBatchId === batch.id ? "text-blue-800" : "text-gray-800"}`}>
                    {batch.name}
                  </span>
                  <span className={`text-xs flex-shrink-0 ${selectedBatchId === batch.id ? "text-blue-600" : "text-gray-600"}`}>
                    {batch.itemCount}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${TYPE_COLORS[batch.type] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {batch.type}
                </span>
                {batch.fiscalYear && (
                  <span className="text-xs text-gray-600">FY {batch.fiscalYear}</span>
                )}
              </div>
            </button>

            {/* Batch actions */}
            {isAdmin && (
              <div className="flex border-t border-gray-100">
                <button
                  onClick={() => { setRenamingBatchId(batch.id); setRenameValue(batch.name); }}
                  className="flex-1 py-1.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition"
                  title="Rename"
                >✏️ Rename</button>
                <button
                  onClick={() => deleteBatch(batch)}
                  disabled={deletingBatch === batch.id}
                  className="flex-1 py-1.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 transition disabled:opacity-40 border-l border-gray-100"
                  title="Delete this rate book"
                >
                  {deletingBatch === batch.id ? "…" : "🗑 Delete"}
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Upload new rate book */}
        {isAdmin && (
          <div className="pt-2 space-y-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 text-xs font-medium text-blue-700 bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg hover:bg-blue-100 hover:border-blue-400 transition"
            >
              + Upload Rate Book
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              + Add single rate
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Rates table ── */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Search + info */}
        <div className="flex items-center gap-3">
          <label htmlFor="rate-catalog-search" className="sr-only">Search rates by code or description</label>
          <input
            id="rate-catalog-search"
            type="text"
            placeholder="Search code or description…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search rates by code or description"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {selectedBatchId !== "all" && (
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {pagination?.total ?? 0} rates in this book
            </span>
          )}
        </div>

        {/* Import result/error banners */}
        {importResult && (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
            <span>✓ {importResult.message}</span>
            <button onClick={() => setImportResult(null)} className="text-green-600 ml-4 text-xs">✕</button>
          </div>
        )}
        {importError && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
            <div className="flex items-start justify-between gap-3">
              <div>{importError}</div>
              <button onClick={() => setImportError("")} className="flex-shrink-0 text-red-400">✕</button>
            </div>
            <p className="text-xs text-red-600 mt-2">
              <a href="/api/rates/template" download className="underline">Download Template →</a>
            </p>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12" aria-label="Loading rates">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden />
            <span className="text-gray-600 text-sm">Loading…</span>
          </div>
        ) : rates.length === 0 ? (
          <div className="text-center py-12 text-gray-600 text-sm">
            {search
              ? `No rates matching "${search}".`
              : selectedBatchId !== "all"
              ? "This rate book is empty."
              : "No rates yet. Upload a rate book or add individual rates."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-16">Code</th>
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      className="rounded"
                      aria-label="Select all rates on this page"
                      checked={rates.length > 0 && rates.every(r => selectedRateIds.has(r.id))}
                      onChange={e => setSelectedRateIds(prev => {
                        const next = new Map(prev);
                        if (e.target.checked) { rates.forEach(r => next.set(r.id, r)); }
                        else { rates.forEach(r => next.delete(r.id)); }
                        return next;
                      })}
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-16">Unit</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase w-32">Rate (NRS)</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-16">FY</th>
                  <th className="px-3 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rates.map(rate => (
                  <tr key={rate.id} className={`hover:bg-gray-50 ${selectedRateIds.has(rate.id) ? "bg-blue-50" : ""}`}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="rounded"
                        aria-label={`Select rate ${rate.code} — ${rate.description.slice(0, 40)}`}
                        checked={selectedRateIds.has(rate.id)}
                        onChange={e => setSelectedRateIds(prev => { const s = new Map(prev); e.target.checked ? s.set(rate.id, rate) : s.delete(rate.id); return s; })}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{rate.code}</td>
                    <td className="px-3 py-2.5 text-gray-800 text-xs leading-relaxed">{rate.description}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600 text-xs">{rate.unit}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-800">
                      {fmtNum(rate.baseRate, 2)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500">{rate.fiscalYear}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {projectId && (
                          <button onClick={() => setAnalysisTarget(rate)}
                            className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200" title="Rate analysis">
                            ∑ Analysis
                          </button>
                        )}
                        {isAdmin && rate.source === "CUSTOM" && (
                          <>
                            <button onClick={() => setEditTarget(rate)}
                              className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
                              title="Edit rate">
                              Edit
                            </button>
                            <button onClick={() => deleteRate(rate)} disabled={deleting === rate.id}
                              className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-200 disabled:opacity-40"
                              title="Delete this rate">
                              {deleting === rate.id ? "…" : "Delete"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">← Prev</button>
            <span className="px-3 py-1 text-sm text-gray-600">{page} / {pagination.totalPages} ({pagination.total} rates)</span>
            <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>

      {/* ── Import dialog ── */}
      {showImportDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-dialog-title"
          onKeyDown={e => { if (e.key === "Escape") { setShowImportDialog(false); setImportFile(null); setImportError(""); } }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 id="import-dialog-title" className="font-semibold text-gray-900 mb-4">Create Rate Book</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Rate Book Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={importBatchName}
                  onChange={e => setImportBatchName(e.target.value)}
                  placeholder="e.g. District Rate 2081/82, Custom Set 1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Type</label>
                <div className="flex gap-2">
                  {(["CUSTOM", "DISTRICT"] as const).map(t => (
                    <button key={t} onClick={() => setImportBatchType(t)}
                      className={`flex-1 py-2 text-sm rounded-lg border-2 transition ${
                        importBatchType === t
                          ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {t === "CUSTOM" ? "Custom / Org Rates" : "District Rates"}
                    </button>
                  ))}
                </div>
              </div>

              {importFile && (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-green-500">📎</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{importFile.name}</span>
                  <button onClick={() => setImportFile(null)} className="text-gray-600 hover:text-gray-600">✕</button>
                </div>
              )}

              {/* Rate book limit info */}
              <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                You currently have <strong>{batches.length}</strong> rate book{batches.length !== 1 ? "s" : ""}.
                {batches.filter(b => b.type === "DISTRICT").length >= 1 && importBatchType === "DISTRICT" && (
                  <span className="text-amber-600 block mt-1">
                    ⚠ You already have a District rate book. Consider replacing it instead.
                  </span>
                )}
              </div>
            </div>

            {importError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
                {importError}
              </div>
            )}

            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => { setShowImportDialog(false); setImportFile(null); setImportError(""); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={runImport} disabled={importing || !importBatchName.trim() || !importFile}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {importing ? "Importing…" : "Import Rates"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <RateForm title="New Rate Item" onSave={createRate} onCancel={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <RateForm title="Edit Rate Item" initial={editTarget} onSave={updateRate} onCancel={() => setEditTarget(null)} />
      )}
      {analysisTarget && projectId && (
        <RateAnalysisBuilder rate={analysisTarget} projectId={projectId} onClose={() => setAnalysisTarget(null)} />
      )}
    </div>
  );
}
