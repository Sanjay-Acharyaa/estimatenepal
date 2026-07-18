"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/format";
import { computeEstimateLine } from "@/lib/estimate-formula";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EstimateGroup {
  id: string;
  name: string;
  unit: string;
  totalQuantity: number;
  rate: number;
  baseAmount: number;
  rateCode: string | null;
  rateDescription: string | null;
  isOverridden: boolean;
  wastePct: number;
  markupPct: number;
  notes: string | null;
  itemCost: number;
  saleRate: number;
  totalSale: number;
  vatAmount: number;
  totalWithVat: number;
}

interface EstimateDiscipline {
  id: string;
  name: string;
  groups: EstimateGroup[];
}

interface EstimateDocument {
  project: {
    id: string;
    name: string;
    vatEnabled: boolean;
    vatRate: number;
    contingencyPct: number;
    provisionalSum: number;
    tdsEnabled: boolean;
    tdsRate: number;
  };
  vatRate: number;
  disciplines: EstimateDiscipline[];
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const ALL_COLS = [
  { key: "unit",        label: "Unit",        tooltip: "Unit of measurement for this work item" },
  { key: "qty",         label: "Qty",         tooltip: "Total quantity derived from takeoff" },
  { key: "rate",        label: "Base Rate",   tooltip: "BOQ base rate per unit (NRS), pre-wastage" },
  { key: "wastePct",    label: "Waste %",     tooltip: "Wastage allowance added on top of the base rate" },
  { key: "itemCost",    label: "Item Cost",   tooltip: "Item cost = Qty x Base Rate x (1 + Waste%). Note: if the base rate already embeds wastage from resource analysis, this adds further wastage on top." },
  { key: "markupPct",   label: "Markup %",    tooltip: "Contractor markup applied to the item cost" },
  { key: "saleRate",    label: "Sale Rate",   tooltip: "Sale rate = Base Rate x (1 + Waste%) x (1 + Markup%)" },
  { key: "totalSale",   label: "Total Sale",  tooltip: "Total sale = Qty x Sale Rate" },
  { key: "vatAmount",   label: "VAT",         tooltip: "VAT amount = Total Sale x VAT% (per line). The summary footer VAT includes contingency and provisional sum, so the two totals may differ." },
  { key: "totalWithVat",label: "Total + VAT", tooltip: "Total sale including VAT" },
  { key: "notes",       label: "Notes",       tooltip: "Free-form notes for this work item line" },
] as const;

type ColKey = (typeof ALL_COLS)[number]["key"];
const DEFAULT_HIDDEN: ColKey[] = ["itemCost", "vatAmount"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function NRS(value: number) {
  return fmtNum(value, 2);
}

function pct(value: number) {
  return value.toFixed(2);
}

// ---------------------------------------------------------------------------
// Inline edit cell
// ---------------------------------------------------------------------------

interface EditCellProps {
  value: number;
  onSave: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

function EditCell({ value, onSave, min = 0, max = 100, step = 0.01, className = "" }: EditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= min && n <= max) onSave(n);
    else setDraft(String(value));
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
        className="w-20 border border-blue-400 rounded px-1 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`w-full text-right px-1 py-0.5 text-xs rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-text transition-colors ${className}`}
      title="Click to edit"
    >
      {pct(value)}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Notes cell
// ---------------------------------------------------------------------------

interface NotesCellProps {
  value: string | null;
  onSave: (v: string | null) => void;
}

function NotesCell({ value, onSave }: NotesCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    onSave(trimmed === "" ? null : trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        maxLength={1000}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
        }}
        className="w-full min-w-[120px] border border-blue-400 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100"
        placeholder="Add note..."
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full text-left px-1 py-0.5 text-xs rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-text transition-colors min-w-[80px] truncate"
      title={value ?? "Click to add note"}
    >
      {value ?? <span className="text-gray-400 dark:text-gray-500">--</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Column visibility toggle panel
// ---------------------------------------------------------------------------

interface ColToggleProps {
  visible: Set<ColKey>;
  onChange: (key: ColKey, show: boolean) => void;
  onClose: () => void;
}

function ColTogglePanel({ visible, onChange, onClose }: ColToggleProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div ref={panelRef} className="absolute right-0 top-10 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 w-52">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Columns</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs">
          Close
        </button>
      </div>
      <div className="space-y-1">
        {ALL_COLS.map((col) => (
          <label key={col.key} className="flex items-center gap-2 cursor-pointer py-0.5" title={col.tooltip}>
            <input
              type="checkbox"
              checked={visible.has(col.key)}
              onChange={(e) => onChange(col.key, e.target.checked)}
              className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 dark:border-gray-600 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">{col.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line override state
// ---------------------------------------------------------------------------

interface LineState {
  wastePct: number;
  markupPct: number;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EstimatingSheet({ projectId }: { projectId: string }) {
  const [doc, setDoc] = useState<EstimateDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showColPanel, setShowColPanel] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // Per-group overrides (keyed by groupId) - tracks local edits before server confirms
  const [overrides, setOverrides] = useState<Map<string, LineState>>(new Map());

  // Column visibility from localStorage
  const storageKey = `estimate_cols_${projectId}`;
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    if (typeof window === "undefined") return new Set(ALL_COLS.map((c) => c.key).filter((k) => !DEFAULT_HIDDEN.includes(k as ColKey))) as Set<ColKey>;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: ColKey[] = JSON.parse(stored);
        return new Set(parsed);
      }
    } catch { /* ignore */ }
    const defaults = ALL_COLS.map((c) => c.key).filter((k) => !DEFAULT_HIDDEN.includes(k as ColKey)) as ColKey[];
    return new Set(defaults);
  });

  function toggleCol(key: ColKey, show: boolean) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (show) next.add(key);
      else next.delete(key);
      try { localStorage.setItem(storageKey, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }

  // Load data - abort on unmount or projectId change to prevent stale overwrites
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${projectId}/estimate`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `Request failed (${r.status})`);
        }
        return r.json();
      })
      .then((data: EstimateDocument) => {
        setDoc(data);
        const map = new Map<string, LineState>();
        for (const disc of data.disciplines) {
          for (const g of disc.groups) {
            map.set(g.id, { wastePct: g.wastePct, markupPct: g.markupPct, notes: g.notes });
          }
        }
        setOverrides(map);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId]);

  // Save a single field change; reverts local state if the server rejects.
  const saveOverride = useCallback(
    async (groupId: string, patch: Partial<LineState>, previous: LineState) => {
      setSaving((prev) => new Set(prev).add(groupId));
      try {
        const res = await fetch(`/api/projects/${projectId}/estimate/lines/${groupId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: "Save failed" } }));
          toast.error(err?.error?.message ?? "Failed to save change. Reverting.");
          setOverrides((prev) => {
            const next = new Map(prev);
            next.set(groupId, previous);
            return next;
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Network error. Change not saved.";
        toast.error(msg);
        setOverrides((prev) => {
          const next = new Map(prev);
          next.set(groupId, previous);
          return next;
        });
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      }
    },
    [projectId]
  );

  function updateOverride(groupId: string, patch: Partial<LineState>) {
    const previous = overrides.get(groupId) ?? { wastePct: 0, markupPct: 0, notes: null };
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(groupId, { ...previous, ...patch });
      return next;
    });
    saveOverride(groupId, patch, previous);
  }

  function toggleDisc(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const searchLower = search.toLowerCase().trim();

  const filteredDisciplines = useMemo(() => {
    if (!doc) return [];
    if (!searchLower) return doc.disciplines;
    return doc.disciplines
      .map((disc) => ({
        ...disc,
        groups: disc.groups.filter(
          (g) =>
            g.name.toLowerCase().includes(searchLower) ||
            (g.rateCode ?? "").toLowerCase().includes(searchLower) ||
            (g.rateDescription ?? "").toLowerCase().includes(searchLower)
        ),
      }))
      .filter((d) => d.groups.length > 0);
  }, [doc, searchLower]);

  // Hooks must all appear before early returns (Rules of Hooks).
  // vatRate is derived from doc here with a null guard so this memo is safe before doc is loaded.
  const vatRate = doc?.vatRate ?? 0;
  const showVat = doc?.project.vatEnabled ?? false;

  // PERF-1: compute all groups once; both the totals memo and the render loop read from this map.
  const computedLines = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeEstimateLine>>();
    if (!doc) return map;
    for (const disc of doc.disciplines) {
      for (const g of disc.groups) {
        const ov = overrides.get(g.id) ?? { wastePct: 0, markupPct: 0, notes: null };
        map.set(g.id, computeEstimateLine(g.totalQuantity, g.rate, ov.wastePct, ov.markupPct, vatRate));
      }
    }
    return map;
  }, [doc, overrides, vatRate]);

  const { liveTotalSale, filteredTotalSale, filteredTotalWithVat, summaryFigures } = useMemo(() => {
    const zeros = { contingencyPct: 0, contingencyAmount: 0, provisionalSum: 0, subtotalBeforeVat: 0, vatAmount: 0, tdsEnabled: false, tdsRate: 0, tdsAmount: 0, netPayable: 0 };
    if (!doc) return { liveTotalSale: 0, filteredTotalSale: 0, filteredTotalWithVat: 0, summaryFigures: zeros };

    // Grand total over ALL groups — drives the summary footer regardless of active search.
    let totalSale = 0;
    for (const disc of doc.disciplines) {
      for (const g of disc.groups) {
        totalSale += computedLines.get(g.id)?.totalSale ?? 0;
      }
    }

    // Filtered totals for the table tfoot — reflect only the rows visible after search.
    let fSale = 0;
    let fWithVat = 0;
    for (const disc of filteredDisciplines) {
      for (const g of disc.groups) {
        const c = computedLines.get(g.id);
        if (c) { fSale += c.totalSale; fWithVat += c.totalWithVat; }
      }
    }

    const contingencyPct = doc.project.contingencyPct ?? 0;
    const provisionalSum = doc.project.provisionalSum ?? 0;
    const contingencyAmount = totalSale * (contingencyPct / 100);
    const subtotalBeforeVat = totalSale + contingencyAmount + provisionalSum;
    const vatAmount = subtotalBeforeVat * (vatRate / 100);
    const tdsEnabled = doc.project.tdsEnabled ?? false;
    const tdsRate = doc.project.tdsRate ?? 0;
    const tdsAmount = tdsEnabled ? subtotalBeforeVat * (tdsRate / 100) : 0;
    const netPayable = subtotalBeforeVat + vatAmount - tdsAmount;
    return {
      liveTotalSale: totalSale,
      filteredTotalSale: fSale,
      filteredTotalWithVat: fWithVat,
      summaryFigures: { contingencyPct, contingencyAmount, provisionalSum, subtotalBeforeVat, vatAmount, tdsEnabled, tdsRate, tdsAmount, netPayable },
    };
  }, [doc, computedLines, filteredDisciplines, vatRate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-500 dark:text-gray-400">
        Loading estimating sheet...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-red-600 dark:text-red-400">
        Failed to load: {error}
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search work items..."
          className="flex-1 max-w-xs text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {showVat ? `VAT ${vatRate}%` : "VAT disabled"}
        </span>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setCollapsed(new Set())}
            className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            title="Expand all sections"
          >
            Expand all
          </button>
          <button
            onClick={() => setCollapsed(new Set(doc.disciplines.map(d => d.id)))}
            className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            title="Collapse all sections"
          >
            Collapse all
          </button>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowColPanel((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Columns
          </button>
          {showColPanel && (
            <ColTogglePanel
              visible={visibleCols}
              onChange={toggleCol}
              onClose={() => setShowColPanel(false)}
            />
          )}
        </div>
      </div>

      {/* Scrollable table */}
      <div className="overflow-auto flex-1">
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b-2 border-gray-200 dark:border-gray-700">
              <th className="sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 text-left px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap min-w-[220px] border-r border-gray-200 dark:border-gray-700">
                Work Item
              </th>
              {ALL_COLS.filter((c) => visibleCols.has(c.key)).map((col) => (
                <th
                  key={col.key}
                  title={col.tooltip}
                  className="text-right px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-help"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredDisciplines.length === 0 && (
              <tr>
                <td
                  colSpan={1 + visibleCols.size}
                  className="text-center py-12 text-gray-400 dark:text-gray-500"
                >
                  {searchLower ? "No items match your search." : "No work items found. Add takeoff items first."}
                </td>
              </tr>
            )}

            {filteredDisciplines.map((disc) => {
              const isCollapsed = collapsed.has(disc.id);
              let discSale = 0;
              let discWithVat = 0;
              const groupRows = disc.groups.map((g) => {
                const ov = overrides.get(g.id) ?? { wastePct: 0, markupPct: 0, notes: null };
                const c = computedLines.get(g.id) ?? computeEstimateLine(g.totalQuantity, g.rate, ov.wastePct, ov.markupPct, vatRate);
                discSale += c.totalSale;
                discWithVat += c.totalWithVat;
                return { g, ov, c };
              });

              return [
                // Discipline header row
                <tr
                  key={disc.id}
                  className="bg-blue-50 dark:bg-blue-900/20 border-t border-b border-blue-200 dark:border-blue-800 cursor-pointer select-none hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  onClick={() => toggleDisc(disc.id)}
                >
                  <td className="sticky left-0 z-10 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 font-semibold text-blue-900 dark:text-blue-100 border-r border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2">
                      <svg
                        className={`w-3.5 h-3.5 text-blue-600 dark:text-blue-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      <span>{disc.name}</span>
                      <span className="text-xs font-normal text-blue-600 dark:text-blue-400 ml-1">
                        ({disc.groups.length} items)
                      </span>
                    </div>
                  </td>
                  {ALL_COLS.filter((c) => visibleCols.has(c.key)).map((col) => {
                    if (col.key === "totalSale")
                      return (
                        <td key={col.key} className="px-3 py-2 text-right font-semibold text-blue-900 dark:text-blue-100 tabular-nums">
                          {NRS(discSale)}
                        </td>
                      );
                    if (col.key === "totalWithVat")
                      return (
                        <td key={col.key} className="px-3 py-2 text-right font-semibold text-blue-900 dark:text-blue-100 tabular-nums">
                          {NRS(discWithVat)}
                        </td>
                      );
                    return <td key={col.key} className="px-3 py-2" />;
                  })}
                </tr>,

                // Group rows (hidden when collapsed)
                ...(!isCollapsed
                  ? groupRows.map(({ g, ov, c }, idx) => (
                      <tr
                        key={g.id}
                        className={`border-b transition-colors ${
                          g.rate === 0
                            ? "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/20"
                            : `border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${idx % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-gray-800/20"}`
                        } ${saving.has(g.id) ? "opacity-60" : ""}`}
                      >
                        <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-3 py-2 border-r border-gray-100 dark:border-gray-800">
                          <div className="font-medium text-gray-900 dark:text-gray-100 leading-tight flex items-center gap-1.5 flex-wrap">
                            {g.name}
                            {g.rate === 0 && (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                No rate
                              </span>
                            )}
                            {g.totalQuantity < 0 && (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                                Deduction
                              </span>
                            )}
                          </div>
                          {g.rateCode && (
                            <div className="text-gray-400 dark:text-gray-500 mt-0.5 text-[10px]">
                              {g.rateCode}
                              {g.isOverridden && (
                                <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded text-[9px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  Overridden
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {visibleCols.has("unit") && (
                          <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{g.unit || "--"}</td>
                        )}
                        {visibleCols.has("qty") && (
                          <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200">
                            {fmtNum(g.totalQuantity, 3)}
                          </td>
                        )}
                        {visibleCols.has("rate") && (
                          <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200">{NRS(g.rate)}</td>
                        )}
                        {visibleCols.has("wastePct") && (
                          <td className="px-3 py-2 text-right">
                            <EditCell
                              value={ov.wastePct}
                              min={0}
                              max={100}
                              onSave={(v) => updateOverride(g.id, { wastePct: v })}
                            />
                          </td>
                        )}
                        {visibleCols.has("itemCost") && (
                          <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200">{NRS(c.itemCost)}</td>
                        )}
                        {visibleCols.has("markupPct") && (
                          <td className="px-3 py-2 text-right">
                            <EditCell
                              value={ov.markupPct}
                              min={0}
                              max={100}
                              onSave={(v) => updateOverride(g.id, { markupPct: v })}
                            />
                          </td>
                        )}
                        {visibleCols.has("saleRate") && (
                          <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200">{NRS(c.saleRate)}</td>
                        )}
                        {visibleCols.has("totalSale") && (
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{NRS(c.totalSale)}</td>
                        )}
                        {visibleCols.has("vatAmount") && (
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">{NRS(c.vatAmount)}</td>
                        )}
                        {visibleCols.has("totalWithVat") && (
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">{NRS(c.totalWithVat)}</td>
                        )}
                        {visibleCols.has("notes") && (
                          <td className="px-3 py-2">
                            <NotesCell
                              value={ov.notes}
                              onSave={(v) => updateOverride(g.id, { notes: v })}
                            />
                          </td>
                        )}
                      </tr>
                    ))
                  : []),
              ];
            })}
          </tbody>

          {/* Work items subtotal footer — shows filtered totals when search is active (CALC-1).
               Contingency and provisional sum are in the summary bar below. */}
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 font-semibold">
              <td className="sticky left-0 z-10 bg-gray-100 dark:bg-gray-800 px-3 py-3 border-r border-gray-200 dark:border-gray-700">
                <div className="text-gray-900 dark:text-gray-100">Work Items Total</div>
                {searchLower ? (
                  <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400 mt-0.5">
                    Filtered results only
                  </div>
                ) : (
                  <div className="text-[10px] font-normal text-gray-400 dark:text-gray-500 mt-0.5">
                    Contingency and provisional sum are added in the summary below
                  </div>
                )}
              </td>
              {ALL_COLS.filter((c) => visibleCols.has(c.key)).map((col) => {
                if (col.key === "totalSale")
                  return (
                    <td key={col.key} className="px-3 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                      {NRS(filteredTotalSale)}
                    </td>
                  );
                if (col.key === "totalWithVat")
                  return (
                    <td key={col.key} className="px-3 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                      {NRS(filteredTotalWithVat)}
                    </td>
                  );
                return <td key={col.key} className="px-3 py-3" />;
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Estimate summary footer */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <SummaryCell label="Base Cost" value={liveTotalSale} />
          {summaryFigures.contingencyPct > 0 && (
            <SummaryCell
              label={`Contingency (${summaryFigures.contingencyPct}%)`}
              value={summaryFigures.contingencyAmount}
              tooltip="If your base rates already include contingency from resource analysis, this adds contingency again. Set to 0% if rates already include it."
            />
          )}
          {summaryFigures.provisionalSum > 0 && (
            <SummaryCell label="Provisional Sum" value={summaryFigures.provisionalSum} />
          )}
          {showVat && (
            <SummaryCell label={`VAT (${vatRate}%)`} value={summaryFigures.vatAmount} tooltip="VAT is applied on Base Cost + Contingency + Provisional Sum." />
          )}
          {summaryFigures.tdsEnabled && summaryFigures.tdsAmount > 0 && (
            <SummaryCell label={`TDS withheld (${summaryFigures.tdsRate}%)`} value={-summaryFigures.tdsAmount} negative />
          )}
          <SummaryCell label="Net Payable" value={summaryFigures.netPayable} highlight />
        </div>
      </div>
    </div>
  );
}

function SummaryCell({ label, value, highlight, negative, tooltip }: { label: string; value: number; highlight?: boolean; negative?: boolean; tooltip?: string }) {
  return (
    <div className={`flex flex-col min-w-[140px] ${highlight ? "border-l-2 border-blue-500 pl-3" : ""}`} title={tooltip}>
      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}{tooltip ? " *" : ""}</span>
      <span className={`text-sm font-semibold tabular-nums ${highlight ? "text-blue-700 dark:text-blue-400 text-base" : negative ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-gray-100"}`}>
        {negative ? "-" : ""}NRS {fmtNum(Math.abs(value), 2)}
      </span>
    </div>
  );
}
