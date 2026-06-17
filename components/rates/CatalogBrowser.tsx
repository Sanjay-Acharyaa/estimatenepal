"use client";

import { useState, useEffect, useRef } from "react";

export interface CatalogItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  baseRate: number;
  source: string;
  fiscalYear: string;
}

interface Props {
  onSelect: (item: CatalogItem) => void;
  onClose: () => void;
}

const SOURCE_BADGE: Record<string, string> = {
  DUDBC:    "bg-green-100 text-green-700",
  DISTRICT: "bg-yellow-100 text-yellow-700",
  CUSTOM:   "bg-blue-100 text-blue-700",
};

const NRS = (n: number) =>
  n.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CatalogBrowser({ onSelect, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), limit: "30" });
    if (search.trim()) sp.set("search", search.trim());
    if (source) sp.set("source", source);

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rates?${sp}`);
        const d = await res.json();
        setItems(d.data ?? []);
        setTotal(d.pagination?.total ?? 0);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, source, page]);

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">Browse Rate Catalog</h2>
            <p className="text-xs text-gray-500 mt-0.5">Click a row to expand its full description, then select.</p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Search + Filter */}
        <div className="flex gap-3 px-6 py-3 border-b border-gray-100 flex-shrink-0 bg-gray-50">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">🔍</span>
            <input
              ref={searchRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by code or description…"
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={source}
            onChange={e => { setSource(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All sources</option>
            <option value="CUSTOM">Custom (org)</option>
            <option value="DUDBC">DUDBC</option>
          </select>
          <div className="text-xs text-gray-600 self-center whitespace-nowrap">
            {total} item{total !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="text-center py-12 text-gray-600 text-sm">Searching…</div>
          )}

          {!loading && items.length === 0 && (
            <div className="text-center py-16">
              <p className="text-gray-600 text-sm">
                {search ? `No rates matching "${search}"` : "No rates in catalog yet."}
              </p>
              <p className="text-xs text-gray-600 mt-2">
                Add rates via Rate Catalog → + New Rate, or use bulk import.
              </p>
            </div>
          )}

          {!loading && items.map(item => {
            const expanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className={`border-b border-gray-100 last:border-0 transition-colors ${expanded ? "bg-blue-50" : "hover:bg-gray-50"}`}
              >
                {/* Main row — click to expand/collapse */}
                <button
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className="flex items-start gap-4 w-full px-6 py-4 text-left"
                >
                  {/* Code badge */}
                  <div className="flex-shrink-0 w-16 text-center">
                    <span className={`font-mono text-xs px-2 py-1 rounded font-semibold block truncate ${expanded ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                      {item.code}
                    </span>
                  </div>

                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${expanded ? "text-blue-900 whitespace-normal" : "text-gray-800 line-clamp-2"}`}>
                      {item.description}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_BADGE[item.source] ?? "bg-gray-100 text-gray-600"}`}>
                        {item.source}
                      </span>
                      <span className="text-xs text-gray-600">FY {item.fiscalYear}</span>
                      {!expanded && (
                        <span className="text-xs text-gray-600 ml-auto">click to expand ▼</span>
                      )}
                    </div>
                  </div>

                  {/* Unit + Rate */}
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-sm font-bold ${expanded ? "text-blue-700" : "text-gray-900"}`}>
                      NRS {NRS(item.baseRate)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">per {item.unit}</p>
                  </div>

                  {/* Expand indicator */}
                  <div className={`flex-shrink-0 self-center text-sm transition-transform ${expanded ? "rotate-180 text-blue-400" : "text-gray-300"}`}>
                    ▼
                  </div>
                </button>

                {/* Expanded: full description + Select button */}
                {expanded && (
                  <div className="px-6 pb-4 flex items-end justify-between gap-4 border-t border-blue-100">
                    <div className="flex-1 pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Full Description</p>
                      <p className="text-sm text-gray-800 leading-relaxed">{item.description}</p>
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        <span>Code: <span className="font-mono font-semibold text-gray-700">{item.code}</span></span>
                        <span>Unit: <span className="font-semibold text-gray-700">{item.unit}</span></span>
                        <span>Rate: <span className="font-semibold text-gray-700">NRS {NRS(item.baseRate)}</span></span>
                        <span>FY: <span className="font-semibold text-gray-700">{item.fiscalYear}</span></span>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); onSelect(item); }}
                      className="flex-shrink-0 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
                    >
                      Select →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-6 py-3 border-t border-gray-200 flex-shrink-0">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
              ← Prev
            </button>
            <span className="text-sm text-gray-600">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
