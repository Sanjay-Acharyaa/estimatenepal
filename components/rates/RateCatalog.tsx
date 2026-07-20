"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";
import { RateForm } from "./RateForm";
import { ResourceLibrary } from "./ResourceLibrary";
import { ResourceLineAnalysis } from "./ResourceLineAnalysis";
import { RateSettingsPanel } from "./RateSettingsPanel";
import { fmtNum } from "@/lib/format";
import { ASSEMBLY_CATEGORIES } from "@/lib/nepal-constants";
import { PAGE_SIZE, DEFAULT_ASSEMBLY_COLOUR } from "@/lib/cache-constants";

type CatalogTab = "rates" | "resources" | "settings";

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
}

const TYPE_COLORS: Record<string, string> = {
  CUSTOM:   "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
  DISTRICT: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
};

function nepalFY(): string {
  const now = new Date();
  const isAfterShrawan = now.getMonth() > 6 || (now.getMonth() === 6 && now.getDate() >= 17);
  const fyStart = now.getFullYear() + (isAfterShrawan ? 57 : 56);
  return `${fyStart}/${String(fyStart + 1).slice(2)}`;
}

export function RateCatalog({ isAdmin }: Props) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [activeTab, setActiveTab] = useState<CatalogTab>("rates");
  const [batches, setBatches] = useState<RateBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | "all">("all");
  const [rates, setRates] = useState<RateItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<RateItem | null>(null);
  const [resourceAnalysisTarget, setResourceAnalysisTarget] = useState<RateItem | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [unbatchedCount, setUnbatchedCount] = useState(0);
  const [renamingBatchId, setRenamingBatchId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Save as Assembly state — Map<id, RateItem> so the full object is available across page navigations
  const [selectedRateIds, setSelectedRateIds] = useState<Map<string, RateItem>>(new Map());
  const [showSaveAsAssembly, setShowSaveAsAssembly] = useState(false);
  const [assemblyForm, setAssemblyForm] = useState({ name: "", description: "", category: "" });
  // "flat"  → each rate becomes a top-level group (good for 1–5 items)
  // "nested" → all rates become layers inside one parent group (good for many items)
  const [assemblyStructure, setAssemblyStructure] = useState<"flat" | "nested">("nested");
  const [savingAssembly, setSavingAssembly] = useState(false);

  const [showBuildRate, setShowBuildRate] = useState(false);
  const [buildRateForm, setBuildRateForm] = useState({ code: "", description: "", unit: "" });
  const [buildRateSaving, setBuildRateSaving] = useState(false);
  const [buildRateError, setBuildRateError] = useState("");
  const buildRateButtonRef = useRef<HTMLButtonElement>(null);
  const isSubmittingBuildRate = useRef(false);

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
      setBatches(Array.isArray(data) ? data : (data.data ?? []));
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
    setLoadError(false);
    try {
      const sp = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) sp.set("search", search);
      if (selectedBatchId !== "all") sp.set("batchId", selectedBatchId);
      const res = await fetch(`/api/rates?${sp}`);
      if (!res.ok) { setLoadError(true); setRates([]); return; }
      const data = await res.json();
      setRates(data.data ?? []);
      setPagination(data.pagination ?? null);
    } catch { setLoadError(true); setRates([]); }
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
      let data: unknown = {};
      try { data = await res.json(); } catch {
        setImportError(`Server returned an unexpected response (HTTP ${res.status}). Please refresh the page and try again.`);
        return;
      }

      if (!res.ok) {
        // data.error may be a string (rate-limit) or an object with .message + .errors
        const errData = data as { error?: string | { message?: string; errors?: string[] } };
        const errorObj = typeof errData.error === "object" ? errData.error : null;
        const msg = typeof errData.error === "string"
          ? errData.error
          : (errorObj?.message ?? `Import failed (HTTP ${res.status}).`);
        const errs = errorObj?.errors;
        setImportError(msg + (errs?.length ? "\n" + errs.slice(0, 5).join("\n") : ""));
      } else {
        const ok = data as { created: number; batchName: string; message: string; batchId?: string };
        setImportResult(ok);
        setShowImportDialog(false);
        setImportFile(null);
        setImportBatchName("");
        loadBatches();
        setSelectedBatchId(ok.batchId ?? "all");
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
      const res = await fetch(`/api/rates/delete-all${param}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error?.message ?? "Failed to delete rates.");
        return;
      }
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
      const res = await fetch(`/api/rate-batches/${batch.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error?.message ?? "Failed to delete rate book.");
        return;
      }
      if (selectedBatchId === batch.id) setSelectedBatchId("all");
      loadBatches(); loadRates();
      toast.success("Rate book deleted.");
    } finally { setDeletingBatch(null); }
  };

  const renameBatch = async (batchId: string) => {
    if (!renameValue.trim()) { setRenamingBatchId(null); return; }
    try {
      const res = await fetch(`/api/rate-batches/${batchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error?.message ?? "Failed to rename.");
      } else {
        loadBatches();
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setRenamingBatchId(null);
    }
  };

  const createRate = async (data: import("./RateForm").RateFormData) => {
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

  const updateRate = async (data: import("./RateForm").RateFormData) => {
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
    const ok = await confirm({ title: "Delete Rate", message: `Delete "${rate.code}: ${rate.description.slice(0, 60)}"?`, variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    setDeleting(rate.id);
    try {
      const res = await fetch(`/api/rates/${rate.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error?.message ?? "Failed to delete rate.");
        return;
      }
      loadRates(); loadBatches(); toast.success("Rate deleted.");
    } finally { setDeleting(null); }
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
      const layers = selectedRates.map((r, i) => ({
        name: r.description.slice(0, 100).trim() || r.code,
        type: unitToGroupType(r.unit),
        colour: DEFAULT_ASSEMBLY_COLOUR,
        lineWidth: 2,
        rateCode: r.code.slice(0, 50),
        sortOrder: i,
        children: [],
      }));

      // nested: one parent group containing all rates as layers
      // flat: each rate is its own top-level group (no layers)
      const groups = assemblyStructure === "nested"
        ? [{
            name: assemblyForm.name.trim().slice(0, 100),
            type: "LINEAR" as const,
            colour: DEFAULT_ASSEMBLY_COLOUR,
            lineWidth: 2,
            rateCode: undefined,
            sortOrder: 0,
            children: layers,
          }]
        : layers;
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
        setAssemblyStructure("nested");
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

  const closeBuildRateModal = () => {
    setShowBuildRate(false);
    setBuildRateForm({ code: "", description: "", unit: "" });
    setBuildRateError("");
    requestAnimationFrame(() => buildRateButtonRef.current?.focus());
  };

  const buildFromResources = async () => {
    if (isSubmittingBuildRate.current) return;
    const description = buildRateForm.description.trim();
    const unit = buildRateForm.unit.trim();
    if (!description || !unit) return;
    const code = buildRateForm.code.trim() || `MR${Date.now().toString(36).toUpperCase()}`;
    isSubmittingBuildRate.current = true;
    setBuildRateSaving(true);
    setBuildRateError("");
    try {
      const res = await fetch("/api/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, description, unit, baseRate: 0, fiscalYear: nepalFY() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setBuildRateError(d.error?.message ?? "Failed to create rate.");
        return;
      }
      const newRate = await res.json() as RateItem;
      setShowBuildRate(false);
      setBuildRateForm({ code: "", description: "", unit: "" });
      setBuildRateError("");
      loadRates();
      loadUnbatchedCount();
      setResourceAnalysisTarget(newRate);
    } catch {
      setBuildRateError("Could not reach the server.");
    } finally {
      isSubmittingBuildRate.current = false;
      setBuildRateSaving(false);
    }
  };

  // Use batch item counts (not filtered pagination.total) so search never distorts the sidebar count
  const allRatesTotal = batches.reduce((s, b) => s + b.itemCount, 0) + unbatchedCount;
  const totalRates = selectedBatchId === "all"
    ? allRatesTotal
    : selectedBatchId === "none"
    ? unbatchedCount
    : (batches.find(b => b.id === selectedBatchId)?.itemCount ?? 0);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {([
          { key: "rates" as CatalogTab, label: "Rate Books" },
          { key: "resources" as CatalogTab, label: "Resource Library" },
          { key: "settings" as CatalogTab, label: "Rate Settings" },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-700 dark:text-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "resources" && (
        <ResourceLibrary isAdmin={isAdmin} />
      )}
      {activeTab === "settings" && (
        <RateSettingsPanel isAdmin={isAdmin} />
      )}
      {activeTab === "rates" && (
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
          <button onClick={() => setSelectedRateIds(new Map())} className="text-gray-400 hover:text-white text-sm">Clear</button>
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
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 id="save-assembly-title" className="font-semibold text-gray-800 dark:text-gray-100 mb-1">Save as Assembly</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {selectedRateIds.size} rate item{selectedRateIds.size !== 1 ? "s" : ""} will be saved as layers. Units are auto-mapped to measurement types.
            </p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Assembly name <span className="text-red-500">*</span></label>
                <input value={assemblyForm.name} onChange={e => setAssemblyForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Standard Road Subbase" autoFocus
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category</label>
                <select value={assemblyForm.category} onChange={e => setAssemblyForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">None</option>
                  {ASSEMBLY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Structure</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => setAssemblyStructure("nested")}
                    className={`p-2.5 rounded-lg border-2 text-left transition ${assemblyStructure === "nested" ? "border-orange-400 bg-orange-50 dark:bg-orange-900/20" : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"}`}
                  >
                    <p className={`text-xs font-semibold ${assemblyStructure === "nested" ? "text-orange-700 dark:text-orange-300" : "text-gray-700 dark:text-gray-300"}`}>Grouped (recommended)</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">1 group → {selectedRateIds.size} layers inside</p>
                  </button>
                  <button type="button"
                    onClick={() => setAssemblyStructure("flat")}
                    className={`p-2.5 rounded-lg border-2 text-left transition ${assemblyStructure === "flat" ? "border-orange-400 bg-orange-50 dark:bg-orange-900/20" : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"}`}
                  >
                    <p className={`text-xs font-semibold ${assemblyStructure === "flat" ? "text-orange-700 dark:text-orange-300" : "text-gray-700 dark:text-gray-300"}`}>Flat</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{selectedRateIds.size} separate groups</p>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description (optional)</label>
                <input value={assemblyForm.description} onChange={e => setAssemblyForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description…"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSaveAsAssembly} disabled={savingAssembly || !assemblyForm.name.trim()}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded-lg text-sm transition disabled:opacity-50">
                {savingAssembly ? "Saving…" : "Save Assembly"}
              </button>
              <button onClick={() => setShowSaveAsAssembly(false)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Left: Rate Books sidebar ── */}
      <div className="w-full sm:w-64 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rate Books</p>
          <a href="/api/rates/template" download
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline">↓ Template</a>
        </div>

        {/* All rates */}
        <button
          onClick={() => { setSelectedBatchId("all"); setPage(1); }}
          className={`w-full text-left px-3 py-2.5 rounded-lg border transition text-sm ${
            selectedBatchId === "all"
              ? "bg-gray-900 dark:bg-gray-700 text-white border-gray-900 dark:border-gray-600"
              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">All Rates</span>
            <span className={`text-xs ${selectedBatchId === "all" ? "text-gray-300" : "text-gray-600 dark:text-gray-400"}`}>
              {totalRates}
            </span>
          </div>
        </button>

        {/* Unbatched rates (imported before Rate Books) */}
        {unbatchedCount > 0 && (
          <div className={`rounded-lg border transition ${
            selectedBatchId === "none"
              ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
              : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-500"
          }`}>
            <button
              onClick={() => { setSelectedBatchId("none"); setPage(1); }}
              className="w-full text-left px-3 py-2.5"
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${selectedBatchId === "none" ? "text-amber-800 dark:text-amber-300" : "text-gray-700 dark:text-gray-200"}`}>
                  Unbatched Rates
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-bold">{unbatchedCount}</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Imported before Rate Books</p>
            </button>
            {isAdmin && (
              <div className="border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => deleteAll("none", "Unbatched Rates", unbatchedCount)}
                  disabled={deletingBatch === "none"}
                  className="w-full py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-40"
                >
                  {deletingBatch === "none" ? "Deleting…" : `Delete all ${unbatchedCount}`}
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
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-500"
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
                  className="w-full text-sm border border-blue-400 dark:border-blue-500 rounded px-1.5 py-0.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none"
                />
              ) : (
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-sm font-medium truncate flex-1 ${selectedBatchId === batch.id ? "text-blue-800 dark:text-blue-200" : "text-gray-800 dark:text-gray-100"}`}>
                    {batch.name}
                  </span>
                  <span className={`text-xs flex-shrink-0 ${selectedBatchId === batch.id ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"}`}>
                    {batch.itemCount}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${TYPE_COLORS[batch.type] ?? "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"}`}>
                  {batch.type}
                </span>
                {batch.fiscalYear && (
                  <span className="text-xs text-gray-600 dark:text-gray-400">FY {batch.fiscalYear}</span>
                )}
              </div>
            </button>

            {/* Batch actions */}
            {isAdmin && (
              <div className="flex border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => { setRenamingBatchId(batch.id); setRenameValue(batch.name); }}
                  className="flex-1 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition"
                  title="Rename"
                >Rename</button>
                <button
                  onClick={() => deleteBatch(batch)}
                  disabled={deletingBatch === batch.id}
                  className="flex-1 py-1.5 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition disabled:opacity-40 border-l border-gray-100 dark:border-gray-700"
                  title="Delete this rate book"
                >
                  {deletingBatch === batch.id ? "…" : "Delete"}
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
              ref={buildRateButtonRef}
              type="button"
              onClick={() => { setBuildRateError(""); setShowBuildRate(true); }}
              className="w-full py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/10 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/20 transition"
            >
              + Build from Resources
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-1.5 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
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
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {selectedBatchId !== "all" && (
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap" title="Total in this book (search may show fewer)">
              {totalRates} rates in this book{search ? ` (${pagination?.total ?? 0} matching)` : ""}
            </span>
          )}
        </div>

        {/* Import result/error banners */}
        {importResult && (
          <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg px-4 py-3 text-sm text-green-800 dark:text-green-300">
            <span>{importResult.message}</span>
            <button onClick={() => setImportResult(null)} aria-label="Dismiss" className="text-green-600 dark:text-green-400 ml-4 text-xs">&times;</button>
          </div>
        )}
        {importError && (
          <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
            <div className="flex items-start justify-between gap-3">
              <div>{importError}</div>
              <button onClick={() => setImportError("")} aria-label="Dismiss" className="flex-shrink-0 text-red-400 dark:text-red-500">&times;</button>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              <a href="/api/rates/template" download className="underline">Download Template →</a>
            </p>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12" aria-label="Loading rates">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden />
            <span className="text-gray-600 dark:text-gray-400 text-sm">Loading…</span>
          </div>
        ) : loadError ? (
          <div className="text-center py-12 text-red-600 dark:text-red-400 text-sm">
            Failed to load rates. Check your connection and try again.
          </div>
        ) : rates.length === 0 ? (
          <div className="text-center py-12 text-gray-600 dark:text-gray-400 text-sm">
            {search
              ? `No rates matching "${search}".`
              : selectedBatchId !== "all"
              ? "This rate book is empty."
              : "No rates yet. Upload a rate book or add individual rates."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-16">Code</th>
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
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Description</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-16">Unit</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-32">Rate (NRS)</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-16">FY</th>
                  <th className="px-3 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rates.map(rate => (
                  <tr key={rate.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 ${selectedRateIds.has(rate.id) ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="rounded"
                        aria-label={`Select rate ${rate.code} — ${rate.description.slice(0, 40)}`}
                        checked={selectedRateIds.has(rate.id)}
                        onChange={e => setSelectedRateIds(prev => { const s = new Map(prev); if (e.target.checked) { s.set(rate.id, rate); } else { s.delete(rate.id); } return s; })}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">{rate.code}</td>
                    <td className="px-3 py-2.5 text-gray-800 dark:text-gray-100 text-xs leading-relaxed">{rate.description}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600 dark:text-gray-400 text-xs">{rate.unit}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-800 dark:text-gray-100">
                      {fmtNum(rate.baseRate, 2)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 dark:text-gray-400">{rate.fiscalYear}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setResourceAnalysisTarget(rate)}
                          className="px-2 py-1 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded border border-purple-200 dark:border-purple-700" title="Resource analysis">
                          Resource Analysis
                        </button>
                        {isAdmin && rate.source === "CUSTOM" && (
                          <>
                            <button onClick={() => setEditTarget(rate)}
                              className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              title="Edit rate">
                              Edit
                            </button>
                            <button onClick={() => deleteRate(rate)} disabled={deleting === rate.id}
                              className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded border border-red-200 dark:border-red-700 disabled:opacity-40"
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
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-40">Prev</button>
            <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">{page} / {pagination.totalPages} ({pagination.total} rates)</span>
            <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-40">Next</button>
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
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 id="import-dialog-title" className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Create Rate Book</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Rate Book Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={importBatchName}
                  onChange={e => setImportBatchName(e.target.value)}
                  placeholder="e.g. District Rate 2081/82, Custom Set 1"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Type</label>
                <div className="flex gap-2">
                  {(["CUSTOM", "DISTRICT"] as const).map(t => (
                    <button key={t} onClick={() => setImportBatchType(t)}
                      className={`flex-1 py-2 text-sm rounded-lg border-2 transition ${
                        importBatchType === t
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                          : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500"
                      }`}
                    >
                      {t === "CUSTOM" ? "Custom / Org Rates" : "District Rates"}
                    </button>
                  ))}
                </div>
              </div>

              {importFile && (
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700 dark:text-gray-200 flex-1 truncate">{importFile.name}</span>
                  <button onClick={() => setImportFile(null)} aria-label="Remove file" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">&times;</button>
                </div>
              )}

              {/* Rate book limit info */}
              <div className="text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-3 py-2">
                You currently have <strong>{batches.length}</strong> rate book{batches.length !== 1 ? "s" : ""}.
                {batches.filter(b => b.type === "DISTRICT").length >= 1 && importBatchType === "DISTRICT" && (
                  <span className="text-amber-600 dark:text-amber-400 block mt-1">
                    You already have a District rate book. Consider replacing it instead.
                  </span>
                )}
              </div>
            </div>

            {importError && (
              <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
                {importError}
              </div>
            )}

            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => { setShowImportDialog(false); setImportFile(null); setImportError(""); }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
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

      {showBuildRate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="build-rate-title"
          onKeyDown={e => { if (e.key === "Escape") closeBuildRateModal(); }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 id="build-rate-title" className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Build Market Rate</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Creates a custom rate item then opens Resource Analysis so you can build the composite rate from your resource library. Click &ldquo;Apply to Base Rate&rdquo; when done.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  value={buildRateForm.description}
                  onChange={e => setBuildRateForm(f => ({ ...f, description: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) buildFromResources(); }}
                  maxLength={500}
                  placeholder="e.g. Plain Cement Concrete 1:2:4"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Unit <span className="text-red-500">*</span>
                </label>
                <input
                  value={buildRateForm.unit}
                  onChange={e => setBuildRateForm(f => ({ ...f, unit: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) buildFromResources(); }}
                  maxLength={50}
                  placeholder="e.g. Cu.m., Sq.m., Rft."
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Code <span className="text-xs text-gray-400 font-normal">(auto-generated if blank)</span>
                </label>
                <input
                  value={buildRateForm.code}
                  onChange={e => setBuildRateForm(f => ({ ...f, code: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) buildFromResources(); }}
                  maxLength={50}
                  placeholder="e.g. MR001"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            {buildRateError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-3">{buildRateError}</p>
            )}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={buildFromResources}
                disabled={buildRateSaving || !buildRateForm.description.trim() || !buildRateForm.unit.trim()}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg text-sm transition disabled:opacity-50"
              >
                {buildRateSaving ? "Creating…" : "Create & Analyse"}
              </button>
              <button
                type="button"
                onClick={closeBuildRateModal}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
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
      {resourceAnalysisTarget && (
        <ResourceLineAnalysis
          rate={resourceAnalysisTarget}
          isAdmin={isAdmin}
          onClose={() => setResourceAnalysisTarget(null)}
          onRateUpdated={() => loadRates()}
        />
      )}
    </div>
    )}
    </div>
  );
}
