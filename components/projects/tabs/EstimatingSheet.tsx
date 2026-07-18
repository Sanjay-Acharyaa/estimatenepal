"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  subtotalSale: number;
  subtotalWithVat: number;
}

interface EstimateDocument {
  project: {
    id: string;
    name: string;
    vatEnabled: boolean;
    vatRate: number;
  };
  vatRate: number;
  disciplines: EstimateDiscipline[];
  grandTotalSale: number;
  grandTotalWithVat: number;
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const ALL_COLS = [
  { key: "unit", label: "Unit" },
  { key: "qty", label: "Qty" },
  { key: "rate", label: "Base Rate" },
  { key: "wastePct", label: "Waste %" },
  { key: "itemCost", label: "Item Cost" },
  { key: "markupPct", label: "Markup %" },
  { key: "saleRate", label: "Sale Rate" },
  { key: "totalSale", label: "Total Sale" },
  { key: "vatAmount", label: "VAT" },
  { key: "totalWithVat", label: "Total + VAT" },
  { key: "notes", label: "Notes" },
] as const;

type ColKey = (typeof ALL_COLS)[number]["key"];
const DEFAULT_HIDDEN: ColKey[] = ["itemCost", "vatAmount"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function NRS(value: number) {
  return value.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(value: number) {
  return value.toFixed(2);
}

function computeFromOverrides(
  totalQuantity: number,
  rate: number,
  wastePct: number,
  markupPct: number,
  vatRate: number
) {
  const itemCost = totalQuantity * rate * (1 + wastePct / 100);
  const safeMkp = Math.min(markupPct, 99.99);
  const saleRate = safeMkp >= 100 ? rate : (rate * (1 + wastePct / 100)) / (1 - safeMkp / 100);
  const totalSale = totalQuantity * saleRate;
  const vatAmount = totalSale * (vatRate / 100);
  const totalWithVat = totalSale + vatAmount;
  return { itemCost, saleRate, totalSale, vatAmount, totalWithVat };
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
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
  return (
    <div className="absolute right-0 top-10 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 w-52">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Columns</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs">
          Close
        </button>
      </div>
      <div className="space-y-1">
        {ALL_COLS.map((col) => (
          <label key={col.key} className="flex items-center gap-2 cursor-pointer py-0.5">
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

  // Load data
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${projectId}/estimate`)
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((data: EstimateDocument) => {
        setDoc(data);
        // Seed override map from server data
        const map = new Map<string, LineState>();
        for (const disc of data.disciplines) {
          for (const g of disc.groups) {
            map.set(g.id, { wastePct: g.wastePct, markupPct: g.markupPct, notes: g.notes });
          }
        }
        setOverrides(map);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Save a single field change
  const saveOverride = useCallback(
    async (groupId: string, patch: Partial<LineState>) => {
      setSaving((prev) => new Set(prev).add(groupId));
      try {
        const res = await fetch(`/api/projects/${projectId}/estimate/lines/${groupId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: "Save failed" } }));
          console.error("Save override error:", err);
        }
      } catch (e) {
        console.error("Save override error:", e);
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
    setOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(groupId) ?? { wastePct: 0, markupPct: 0, notes: null };
      next.set(groupId, { ...existing, ...patch });
      return next;
    });
    saveOverride(groupId, patch);
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

  const vatRate = doc.vatRate;

  // Grand totals from live override state
  let liveTotalSale = 0;
  let liveTotalWithVat = 0;
  for (const disc of doc.disciplines) {
    for (const g of disc.groups) {
      const ov = overrides.get(g.id) ?? { wastePct: 0, markupPct: 0, notes: null };
      const c = computeFromOverrides(g.totalQuantity, g.rate, ov.wastePct, ov.markupPct, vatRate);
      liveTotalSale += c.totalSale;
      liveTotalWithVat += c.totalWithVat;
    }
  }

  const showVat = doc.project.vatEnabled;

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
        <div className="relative ml-auto">
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
                  className="text-right px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap"
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
                const c = computeFromOverrides(g.totalQuantity, g.rate, ov.wastePct, ov.markupPct, vatRate);
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
                        className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                          idx % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-gray-800/20"
                        } ${saving.has(g.id) ? "opacity-60" : ""}`}
                      >
                        <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-3 py-2 border-r border-gray-100 dark:border-gray-800">
                          <div className="font-medium text-gray-900 dark:text-gray-100 leading-tight">
                            {g.name}
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
                            {g.totalQuantity.toLocaleString("en-NP", { maximumFractionDigits: 3 })}
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
                              max={99.99}
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

          {/* Grand total footer */}
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 font-semibold">
              <td className="sticky left-0 z-10 bg-gray-100 dark:bg-gray-800 px-3 py-3 text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700">
                Grand Total
              </td>
              {ALL_COLS.filter((c) => visibleCols.has(c.key)).map((col) => {
                if (col.key === "totalSale")
                  return (
                    <td key={col.key} className="px-3 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                      {NRS(liveTotalSale)}
                    </td>
                  );
                if (col.key === "totalWithVat")
                  return (
                    <td key={col.key} className="px-3 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                      {NRS(liveTotalWithVat)}
                    </td>
                  );
                return <td key={col.key} className="px-3 py-3" />;
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
