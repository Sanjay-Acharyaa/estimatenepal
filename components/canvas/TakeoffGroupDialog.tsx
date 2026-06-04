"use client";

import { useState, useRef, useEffect } from "react";
import { CatalogBrowser } from "@/components/rates/CatalogBrowser";
import type { CatalogItem } from "@/components/rates/CatalogBrowser";

export const TOOL_TYPES = [
  { value: "LINEAR",             label: "Linear",             desc: "Length — pipe, conduit, reinforcement bar" },
  { value: "AREA",               label: "Area",               desc: "Sq.m / Sq.ft — flooring, plastering, roofing" },
  { value: "VERTICAL_WALL_AREA", label: "Vertical Wall Area", desc: "Perimeter × wall height — paint, cladding" },
  { value: "COUNT",              label: "Count",              desc: "Individual items — doors, columns, fixtures" },
  { value: "COUNT_BY_DISTANCE",  label: "Count by Distance",  desc: "Length ÷ spacing — bolts, hooks, anchors" },
  { value: "VOLUME",             label: "Volume",             desc: "Cu.m / Cu.ft — excavation, concrete, masonry" },
] as const;

const PRESET_COLORS = [
  "#3B82F6","#EF4444","#10B981","#F59E0B","#8B5CF6",
  "#EC4899","#06B6D4","#84CC16","#F97316","#6366F1",
];

type TakeoffType = (typeof TOOL_TYPES)[number]["value"];

export const COUNT_SHAPES = [
  { value: "circle",   label: "●", title: "Circle" },
  { value: "square",   label: "■", title: "Square" },
  { value: "triangle", label: "▲", title: "Triangle" },
  { value: "diamond",  label: "◆", title: "Diamond" },
  { value: "cross",    label: "✕", title: "Cross" },
  { value: "star",     label: "★", title: "Star" },
] as const;
export type CountShape = (typeof COUNT_SHAPES)[number]["value"];

type SaveData = {
  name: string;
  type: TakeoffType;
  colour: string;
  lineWidth: number;
  tag?: string;
  multiplier: number;
  rateItemId?: string | null;
  countShape?: CountShape;
};

type Props = {
  initial?: Omit<SaveData, "rateItemId">;
  onSave: (data: SaveData) => void;
  onCancel: () => void;
  title?: string;
};

const NRS = (n: number) =>
  n.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function TakeoffGroupDialog({ initial, onSave, onCancel, title = "Create New Takeoff Layer" }: Props) {
  // Catalog
  const [catalogItem, setCatalogItem] = useState<CatalogItem | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [skipCatalog, setSkipCatalog] = useState(!!initial); // editing mode skips catalog
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Layer fields
  const [name, setName] = useState(initial?.name ?? "");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [type, setType] = useState<TakeoffType>(initial?.type ?? "LINEAR");
  const [colour, setColour] = useState(initial?.colour ?? "#3B82F6");
  const [lineWidth, setLineWidth] = useState(initial?.lineWidth ?? 2);
  const [countShape, setCountShape] = useState<CountShape>("circle");
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [multiplier, setMultiplier] = useState(String(initial?.multiplier ?? 1));
  const [error, setError] = useState("");

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Search catalog inline
  useEffect(() => {
    if (!showDropdown || !catalogSearch.trim() || catalogItem) { setCatalogResults([]); return; }
    const t = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const res = await fetch(`/api/rates?search=${encodeURIComponent(catalogSearch)}&limit=8`);
        const d = await res.json();
        setCatalogResults(d.data ?? []);
      } catch { setCatalogResults([]); }
      finally { setCatalogLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [catalogSearch, showDropdown, catalogItem]);

  function selectCatalog(item: CatalogItem) {
    setCatalogItem(item);
    setCatalogSearch(item.code + " — " + item.description);
    setShowDropdown(false);
    setShowBrowser(false);
    // Auto-fill name if the user hasn't manually typed one
    if (!nameManuallyEdited) {
      setName(item.description.length > 60 ? item.description.slice(0, 60) + "…" : item.description);
    }
  }

  function clearCatalog() {
    setCatalogItem(null);
    setCatalogSearch("");
    setCatalogResults([]);
    setName("");
    setNameManuallyEdited(false);
  }

  function handleSave() {
    const isNew = !initial;
    if (isNew && !skipCatalog && !catalogItem) {
      setError("Select a catalog item or choose 'Skip catalog'.");
      return;
    }
    if (!name.trim()) { setError("Layer name is required."); return; }
    const mult = parseFloat(multiplier);
    if (!mult || mult <= 0) { setError("Multiplier must be > 0."); return; }
    onSave({
      name: name.trim(),
      type,
      colour,
      lineWidth,
      tag: tag || undefined,
      multiplier: mult,
      rateItemId: catalogItem?.id ?? null,
      countShape: type === "COUNT" ? countShape : undefined,
    });
  }

  const isNew = !initial;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            {/* ── Catalog Item (new layers only) ── */}
            {isNew && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700">
                    Catalog Item
                    {!skipCatalog && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <button
                    onClick={() => { setSkipCatalog(s => !s); clearCatalog(); setError(""); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {skipCatalog ? "← Link to catalog" : "Skip catalog"}
                  </button>
                </div>

                {!skipCatalog && (
                  <div ref={dropdownRef} className="relative">
                    {catalogItem ? (
                      // Selected state
                      <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-xs font-bold text-gray-700">{catalogItem.code}</span>
                            <span className="text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">{catalogItem.source}</span>
                          </div>
                          <p className="text-xs text-gray-700 leading-snug">{catalogItem.description}</p>
                          <p className="text-xs text-blue-700 font-semibold mt-1">
                            NRS {NRS(catalogItem.baseRate)} / {catalogItem.unit}
                          </p>
                        </div>
                        <button onClick={clearCatalog} className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0">✕</button>
                      </div>
                    ) : (
                      // Search + browse
                      <>
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <input
                              value={catalogSearch}
                              onChange={e => { setCatalogSearch(e.target.value); setShowDropdown(true); }}
                              onFocus={() => setShowDropdown(true)}
                              placeholder="Enter material name or search catalog…"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <button
                            onClick={() => setShowBrowser(true)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex-shrink-0 transition"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                            </svg>
                            Browse Catalog
                          </button>
                        </div>

                        {/* Inline dropdown results */}
                        {showDropdown && catalogSearch.length >= 2 && (
                          <div className="absolute z-50 left-0 right-12 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                            {catalogLoading && <p className="text-center py-3 text-xs text-gray-400">Searching…</p>}
                            {!catalogLoading && catalogResults.length === 0 && (
                              <div className="py-4 px-3 text-center">
                                <p className="text-xs text-gray-500">No results for "{catalogSearch}"</p>
                                <button onClick={() => setShowBrowser(true)} className="text-xs text-blue-600 hover:underline mt-1">
                                  Browse full catalog →
                                </button>
                              </div>
                            )}
                            {catalogResults.map(r => (
                              <button key={r.id} onClick={() => selectCatalog(r)}
                                className="flex items-start gap-3 w-full px-3 py-2.5 text-left hover:bg-blue-50 border-b border-gray-50 last:border-0">
                                <span className="font-mono text-xs text-gray-500 flex-shrink-0 mt-0.5 w-10">{r.code}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-gray-700 truncate">{r.description}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-xs font-semibold text-gray-800">NRS {NRS(r.baseRate)}</p>
                                  <p className="text-xs text-gray-400">/{r.unit}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {skipCatalog && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    No catalog item — quantities will be measured but BOQ amounts will show NRS 0 until a rate is linked later.
                  </p>
                )}
              </div>
            )}

            {/* ── Layer Name ── */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Layer Name <span className="text-red-500">*</span>
                {catalogItem && !initial && <span className="text-gray-400 font-normal ml-1">(auto-filled from catalog)</span>}
              </label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setNameManuallyEdited(true); setError(""); }}
                placeholder="e.g. Foundation Excavation — Block A"
                autoFocus={!!initial || skipCatalog}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* ── Takeoff Type ── */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Takeoff Type <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-2">
                {TOOL_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`text-left px-3 py-2 rounded-lg border-2 text-xs transition ${
                      type === t.value
                        ? "border-blue-500 bg-blue-50 text-blue-800"
                        : "border-gray-200 hover:border-gray-300 text-gray-700"
                    }`}
                  >
                    <p className="font-semibold">{t.label}</p>
                    <p className={`mt-0.5 ${type === t.value ? "text-blue-600" : "text-gray-400"}`}>{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Color ── */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setColour(c)}
                    className={`w-7 h-7 rounded-full border-2 transition ${colour === c ? "border-gray-800 scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={colour} onChange={e => setColour(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border border-gray-300" title="Custom color" />
              </div>
            </div>

            {/* ── Marker Shape (COUNT only) ── */}
            {type === "COUNT" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Marker Shape</label>
                <div className="flex gap-2">
                  {COUNT_SHAPES.map(s => (
                    <button key={s.value} type="button" title={s.title}
                      onClick={() => setCountShape(s.value)}
                      style={{ color: countShape === s.value ? colour : undefined }}
                      className={`flex-1 py-2 text-base rounded-lg border-2 transition ${
                        countShape === s.value
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 text-gray-500"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Line Width / Dot Size ── */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {type === "COUNT" ? "Dot Size" : "Line Width"}:
                <span className="font-bold ml-1">{lineWidth}</span>
              </label>
              <input type="range" min={1} max={8} step={1} value={lineWidth}
                onChange={e => setLineWidth(Number(e.target.value))}
                className="w-full accent-blue-600" />
            </div>

            {/* ── Tag + Multiplier ── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tag (optional)</label>
                <input type="text" value={tag} onChange={e => setTag(e.target.value)}
                  placeholder={'e.g. AFF 18\'-9"'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Multiplier</label>
                <input type="number" min="0.001" step="0.1" value={multiplier}
                  onChange={e => setMultiplier(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-5 py-4 border-t border-gray-200 flex-shrink-0">
            <button onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm transition">
              {initial ? "Save Changes" : catalogItem ? `Create Layer — ${catalogItem.code}` : "Create Layer"}
            </button>
            <button onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </div>

      {showBrowser && (
        <CatalogBrowser
          onSelect={item => selectCatalog(item)}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </>
  );
}
