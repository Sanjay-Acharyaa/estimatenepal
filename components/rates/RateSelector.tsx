"use client";

import { useState, useEffect, useRef } from "react";

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
    fetch(`/api/rates?${sp}`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setRates(d.data ?? []))
      .catch(() => setRates([]))
      .finally(() => setLoading(false));
  }, [open, search]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
      >
        {value ? (
          <span className="truncate">
            <span className="font-mono text-xs text-gray-500 mr-1">{value.code}</span>
            {value.description}
          </span>
        ) : (
          <span className="text-gray-600">{placeholder}</span>
        )}
        <span className="text-gray-600 flex-shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code or description…"
              className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {value && (
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-b border-gray-100"
              >
                ✕ Remove rate assignment
              </button>
            )}
            {loading && <p className="text-center py-4 text-xs text-gray-600">Loading…</p>}
            {!loading && rates.length === 0 && (
              <p className="text-center py-4 text-xs text-gray-600">No rates found. Create one in the Rates catalog.</p>
            )}
            {!loading && rates.map(r => (
              <button
                key={r.id}
                onClick={() => { onSelect(r); setOpen(false); setSearch(""); }}
                className={`flex items-start gap-2 w-full px-3 py-2.5 text-left hover:bg-blue-50 border-b border-gray-50 last:border-0 ${value?.id === r.id ? "bg-blue-50" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">{r.code}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${r.source === "DUDBC" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                      {r.source}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 mt-0.5 truncate">{r.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-800">
                    NRS {r.baseRate.toLocaleString("en-NP", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-600">/{r.unit}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
