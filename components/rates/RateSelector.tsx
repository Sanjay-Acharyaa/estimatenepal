"use client";

import { useState, useEffect, useRef } from "react";
import { fmtNum } from "@/lib/format";

export interface RateItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  baseRate: number;
  source: string;
  fiscalYear: string;
}

interface Props {
  value: RateItem | null;
  onSelect: (rate: RateItem | null) => void;
  placeholder?: string;
}

export function RateSelector({ value, onSelect, placeholder = "Search rates…" }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [rates, setRates] = useState<RateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const sp = new URLSearchParams({ limit: "30", ...(search ? { search } : {}) });
    const t = setTimeout(() => {
      fetch(`/api/rates?${sp}`)
        .then(r => r.ok ? r.json() : { data: [] })
        .then(d => setRates(d.data ?? []))
        .catch(() => setRates([]))
        .finally(() => setLoading(false));
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, search]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
      >
        {value ? (
          <span className="truncate">
            <span className="font-mono text-xs text-gray-500 mr-1">{value.code}</span>
            {value.description}
          </span>
        ) : (
          <span className="text-gray-600">{placeholder}</span>
        )}
        <span className="text-gray-600 dark:text-gray-400 flex-shrink-0 text-xs">v</span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code or description…"
              className="w-full text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {value && (
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 border-b border-gray-100 dark:border-gray-700"
              >
                Remove rate assignment
              </button>
            )}
            {loading && <p className="text-center py-4 text-xs text-gray-500 dark:text-gray-400">Loading…</p>}
            {!loading && rates.length === 0 && (
              <p className="text-center py-4 text-xs text-gray-500 dark:text-gray-400">No rates found. Create one in the Rates catalog.</p>
            )}
            {!loading && rates.map(r => (
              <button
                key={r.id}
                onClick={() => { onSelect(r); setOpen(false); setSearch(""); }}
                className={`flex items-start gap-2 w-full px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b border-gray-50 dark:border-gray-700 last:border-0 ${value?.id === r.id ? "bg-blue-50 dark:bg-blue-900/40" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{r.code}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${r.source === "DUDBC" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"}`}>
                      {r.source}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 truncate">{r.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                    NRS {fmtNum(r.baseRate, 2)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">/{r.unit}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
