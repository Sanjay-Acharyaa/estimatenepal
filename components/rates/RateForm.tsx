"use client";

import { useState, useEffect, useRef } from "react";

export interface RateFormData {
  code: string;
  description: string;
  unit: string;
  baseRate: number;
  fiscalYear: string;
}

// Common Nepal construction units
const COMMON_UNITS = [
  { label: "Cu.m — Cubic Metre",       value: "Cu.m" },
  { label: "Sq.m — Square Metre",      value: "Sq.m" },
  { label: "Rmt — Running Metre",      value: "Rmt" },
  { label: "Cu.ft — Cubic Feet",       value: "Cu.ft" },
  { label: "Sq.ft — Square Feet",      value: "Sq.ft" },
  { label: "Rft — Running Feet",       value: "Rft" },
  { label: "Kg — Kilogram",            value: "Kg" },
  { label: "MT — Metric Ton",          value: "MT" },
  { label: "No. — Number / Each",      value: "No." },
  { label: "LS — Lump Sum",            value: "LS" },
  { label: "Bag — Cement bag (50 kg)", value: "Bag" },
  { label: "Litre",                    value: "Litre" },
  { label: "Day — Equipment/labour day", value: "Day" },
  { label: "Set",                      value: "Set" },
  { label: "Pair",                     value: "Pair" },
  { label: "Point",                    value: "Point" },
];

// Nepal's 77 districts
const NEPAL_DISTRICTS = [
  "Achham","Arghakhanchi","Baglung","Bajhang","Bajura","Banke","Bara","Bardiya",
  "Bhaktapur","Bhojpur","Chitwan","Dadeldhura","Dailekh","Dang","Darchula",
  "Dhading","Dhankuta","Dhanusha","Dolakha","Dolpa","Doti","Gorkha","Gulmi",
  "Humla","Ilam","Jajarkot","Jhapa","Jumla","Kailali","Kalikot","Kanchanpur",
  "Kapilvastu","Kaski","Kathmandu","Kavrepalanchok","Khotang","Lalitpur","Lamjung",
  "Mahottari","Makwanpur","Manang","Morang","Mugu","Mustang","Myagdi","Nawalparasi East",
  "Nawalparasi West","Nuwakot","Okhaldhunga","Palpa","Panchthar","Parbat","Parsa",
  "Pyuthan","Ramechhap","Rasuwa","Rautahat","Rolpa","Rukum East","Rukum West",
  "Rupandehi","Salyan","Sankhuwasabha","Saptari","Sarlahi","Sindhuli","Sindhupalchok",
  "Siraha","Solukhumbu","Sunsari","Surkhet","Syangja","Tanahu","Taplejung",
  "Terhathum","Udayapur",
].sort();

type RateMode = "manual" | "linked";
type LinkedSource = "dudbc" | "district" | "analysis";

interface CatalogRate {
  id: string;
  code: string;
  description: string;
  unit: string;
  baseRate: number;
  source: string;
  fiscalYear: string;
}

interface DistrictRateItem {
  district: string;
  rate: number;
}

interface Props {
  initial?: Partial<RateFormData>;
  onSave: (data: RateFormData) => Promise<void>;
  onCancel: () => void;
  title: string;
  projectId?: string;        // needed for Rate Analysis source
  orgComputedRate?: number;  // pre-loaded from Rate Analysis if available
}

const currentFY = (() => {
  const y = new Date().getFullYear();
  return `${y}/${String(y + 1).slice(2)}`;
})();

const NRS = (n: number) =>
  n.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RateForm({ initial, onSave, onCancel, title, projectId, orgComputedRate }: Props) {
  // Item details
  const [code, setCode] = useState(initial?.code ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [fiscalYear, setFiscalYear] = useState(initial?.fiscalYear ?? currentFY);

  // Base rate source
  const [rateMode, setRateMode] = useState<RateMode>(initial?.baseRate !== undefined ? "manual" : "manual");
  const [linkedSource, setLinkedSource] = useState<LinkedSource>("dudbc");

  // DUDBC / District linked state
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogRate[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogRate | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [showCatalogDropdown, setShowCatalogDropdown] = useState(false);

  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [districtRates, setDistrictRates] = useState<DistrictRateItem[]>([]);
  const [districtRateLoading, setDistrictRateLoading] = useState(false);

  // Manual override (used even in linked mode)
  const [manualOverride, setManualOverride] = useState(false);
  const [manualRate, setManualRate] = useState(String(initial?.baseRate ?? ""));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);

  // Resolve the effective base rate
  const effectiveRate = (() => {
    if (rateMode === "manual" || manualOverride) {
      const r = parseFloat(manualRate);
      return isNaN(r) ? null : r;
    }
    if (linkedSource === "dudbc" && selectedCatalog) return selectedCatalog.baseRate;
    if (linkedSource === "district") {
      const dr = districtRates.find(d => d.district === selectedDistrict);
      return dr?.rate ?? selectedCatalog?.baseRate ?? null;
    }
    if (linkedSource === "analysis") return orgComputedRate ?? null;
    return null;
  })();

  // Search DUDBC catalog
  useEffect(() => {
    if (!showCatalogDropdown || !catalogSearch.trim()) { setCatalogResults([]); return; }
    const t = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const res = await fetch(`/api/rates?search=${encodeURIComponent(catalogSearch)}&source=DUDBC&limit=15`);
        const d = await res.json();
        setCatalogResults(d.data ?? []);
      } catch { setCatalogResults([]); }
      finally { setCatalogLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [catalogSearch, showCatalogDropdown]);

  // Load district rates when catalog item + district selected
  useEffect(() => {
    if (!selectedCatalog || !selectedDistrict || linkedSource !== "district") return;
    setDistrictRateLoading(true);
    fetch(`/api/rates/${selectedCatalog.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setDistrictRates(d?.districtRates ?? []))
      .catch(() => setDistrictRates([]))
      .finally(() => setDistrictRateLoading(false));
  }, [selectedCatalog?.id, selectedDistrict, linkedSource]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowCatalogDropdown(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selectCatalogRate = (rate: CatalogRate) => {
    setSelectedCatalog(rate);
    setShowCatalogDropdown(false);
    setCatalogSearch(rate.code + " — " + rate.description.slice(0, 40));
    // Auto-fill item details from catalog
    if (!code) setCode(rate.code);
    if (!description) setDescription(rate.description);
    if (!unit) setUnit(rate.unit);
    if (!fiscalYear || fiscalYear === currentFY) setFiscalYear(rate.fiscalYear);
  };

  const getDistrictRate = () => {
    if (!selectedDistrict) return null;
    return districtRates.find(d => d.district === selectedDistrict) ?? null;
  };

  const submit = async () => {
    if (!code.trim()) { setError("Item code is required."); return; }
    if (!description.trim()) { setError("Description is required."); return; }
    if (!unit.trim()) { setError("Unit is required."); return; }
    if (effectiveRate === null || effectiveRate < 0) {
      setError("A valid base rate is required. Select a source or enter manually.");
      return;
    }
    setSaving(true); setError("");
    try {
      await onSave({
        code: code.trim(),
        description: description.trim(),
        unit: unit.trim(),
        baseRate: effectiveRate,
        fiscalYear: fiscalYear.trim(),
      });
    } catch (e: any) {
      setError(e.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onCancel} className="text-gray-600 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Item Details ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Item Details</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  S.N / Item Code <span className="text-red-500">*</span>
                </label>
                <input value={code} onChange={e => setCode(e.target.value)}
                  placeholder="e.g. 40, E1.1.1, B2.3"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Fiscal Year <span className="text-red-500">*</span></label>
                <input value={fiscalYear} onChange={e => setFiscalYear(e.target.value)}
                  placeholder="e.g. 2081/82"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="Providing & laying brick masonry work using first class bricks as per NS 1/2035 in cement mortar (1:4)…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
            </div>

            <div className="w-56">
              <label className="block text-xs font-medium text-gray-700 mb-1">Unit <span className="text-red-500">*</span></label>
              <div className="flex gap-1.5">
                <select
                  value={COMMON_UNITS.some(u => u.value === unit) ? unit : "__custom__"}
                  onChange={e => {
                    if (e.target.value !== "__custom__") setUnit(e.target.value);
                    else setUnit("");
                  }}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="__custom__">Custom…</option>
                  {COMMON_UNITS.map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
                {/* Show text input when selection is "Custom" or value isn't in the list */}
                {(!COMMON_UNITS.some(u => u.value === unit) || !unit) && (
                  <input
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    placeholder="type unit…"
                    className="w-24 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
              {unit && (
                <p className="text-xs text-gray-600 mt-1">Unit: <span className="font-medium text-gray-600">{unit}</span></p>
              )}
            </div>
          </div>

          {/* ── Base Rate ── */}
          <div className="border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Base Rate</p>

              {/* Manual / Linked toggle */}
              <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
                <button
                  onClick={() => { setRateMode("manual"); setManualOverride(false); }}
                  className={`px-3 py-1.5 transition ${rateMode === "manual" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  ✎ Manual entry
                </button>
                <button
                  onClick={() => setRateMode("linked")}
                  className={`px-3 py-1.5 border-l border-gray-300 transition ${rateMode === "linked" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  🔗 Link to rate source
                </button>
              </div>
            </div>

            {/* ── Manual mode ── */}
            {rateMode === "manual" && (
              <div className="w-48">
                <label className="block text-xs font-medium text-gray-700 mb-1">Base Rate (NRS)</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">NRS</span>
                  <input type="number" min="0" step="0.01" value={manualRate}
                    onChange={e => setManualRate(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}

            {/* ── Linked mode ── */}
            {rateMode === "linked" && (
              <div className="space-y-4">
                {/* Source type selector */}
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-2">Choose rate source</p>
                  <div className="flex gap-2">
                    {([
                      { key: "dudbc" as LinkedSource, label: "DUDBC Rate", desc: "National standard rates" },
                      { key: "district" as LinkedSource, label: "District Rate", desc: "Location-adjusted rates" },
                      { key: "analysis" as LinkedSource, label: "Rate Analysis", desc: "Org computed breakdown", disabled: !projectId && !orgComputedRate },
                    ]).map(({ key, label, desc, disabled }) => (
                      <button
                        key={key}
                        onClick={() => !disabled && setLinkedSource(key)}
                        disabled={disabled}
                        className={`flex-1 text-left px-3 py-2.5 rounded-lg border-2 transition text-xs disabled:opacity-40 disabled:cursor-not-allowed ${
                          linkedSource === key
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <p className={`font-semibold ${linkedSource === key ? "text-blue-700" : "text-gray-700"}`}>{label}</p>
                        <p className="text-gray-500 mt-0.5">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* DUDBC search */}
                {(linkedSource === "dudbc" || linkedSource === "district") && (
                  <div ref={searchRef} className="relative">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Search DUDBC rate catalog
                    </label>
                    <input
                      value={catalogSearch}
                      onChange={e => { setCatalogSearch(e.target.value); setShowCatalogDropdown(true); setSelectedCatalog(null); }}
                      onFocus={() => setShowCatalogDropdown(true)}
                      placeholder="Type code or description… (DUDBC Phase 8 — may be empty now)"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    {showCatalogDropdown && (catalogResults.length > 0 || catalogLoading || catalogSearch.length >= 2) && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                        {catalogLoading && (
                          <p className="text-center py-4 text-xs text-gray-600">Searching…</p>
                        )}
                        {!catalogLoading && catalogResults.length === 0 && (
                          <div className="py-4 px-3 text-center">
                            <p className="text-xs text-gray-500">No DUDBC rates found.</p>
                            <p className="text-xs text-gray-600 mt-1">DUDBC catalog is added in Phase 8. You can still enter a manual rate.</p>
                          </div>
                        )}
                        {catalogResults.map(r => (
                          <button
                            key={r.id}
                            onClick={() => selectCatalogRate(r)}
                            className="flex items-start gap-3 w-full px-3 py-2.5 text-left hover:bg-blue-50 border-b border-gray-50 last:border-0"
                          >
                            <span className="font-mono text-xs text-gray-500 flex-shrink-0 mt-0.5">{r.code}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-700 truncate">{r.description}</p>
                              <p className="text-xs text-gray-600">{r.unit} · FY {r.fiscalYear}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-semibold text-gray-800">NRS {NRS(r.baseRate)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedCatalog && (
                      <div className="mt-2 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <span className="text-green-600 text-xs">✓</span>
                        <div className="flex-1 text-xs text-green-800 min-w-0">
                          <span className="font-mono font-medium">{selectedCatalog.code}</span>
                          <span className="text-green-600 ml-2">DUDBC rate: NRS {NRS(selectedCatalog.baseRate)} / {selectedCatalog.unit}</span>
                        </div>
                        <button onClick={() => { setSelectedCatalog(null); setCatalogSearch(""); }}
                          className="text-gray-600 hover:text-gray-600 text-sm ml-1">×</button>
                      </div>
                    )}
                  </div>
                )}

                {/* District selector */}
                {linkedSource === "district" && selectedCatalog && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">District</label>
                    <select value={selectedDistrict} onChange={e => setSelectedDistrict(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select district…</option>
                      {NEPAL_DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>

                    {selectedDistrict && (
                      districtRateLoading ? (
                        <p className="text-xs text-gray-600 mt-1.5">Loading district rate…</p>
                      ) : (
                        <div className="mt-2 text-xs">
                          {getDistrictRate() ? (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-800">
                              <span className="font-medium">{selectedDistrict} rate:</span>{" "}
                              <span className="font-bold">NRS {NRS(getDistrictRate()!.rate)}</span> / {selectedCatalog.unit}
                            </div>
                          ) : (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-700">
                              No specific rate for {selectedDistrict}. Using DUDBC base rate:{" "}
                              <span className="font-bold">NRS {NRS(selectedCatalog.baseRate)}</span>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Rate Analysis source */}
                {linkedSource === "analysis" && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
                    {orgComputedRate !== undefined ? (
                      <div>
                        <p className="text-xs text-purple-700 font-medium">
                          Computed from Rate Analysis: <span className="text-lg font-bold text-purple-900">NRS {NRS(orgComputedRate)}</span>
                        </p>
                        <p className="text-xs text-purple-600 mt-1">
                          This rate is derived from your organisation's material + labour + equipment breakdown.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-purple-700">No rate analysis found for this project.</p>
                        <p className="text-xs text-purple-600 mt-1">
                          Open the Rate Catalog, find this rate item, and click ∑ to build a rate analysis first.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Effective rate display */}
                {effectiveRate !== null && !manualOverride && (
                  <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-xs text-gray-500">Effective base rate</p>
                      <p className="text-xl font-bold text-gray-900 mt-0.5">
                        NRS {NRS(effectiveRate)}
                        <span className="text-sm font-normal text-gray-500 ml-1">/ {unit || "unit"}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-600 mb-1">Source</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        linkedSource === "dudbc" ? "bg-green-100 text-green-700" :
                        linkedSource === "district" ? "bg-blue-100 text-blue-700" :
                        "bg-purple-100 text-purple-700"
                      }`}>
                        {linkedSource === "dudbc" ? "DUDBC" : linkedSource === "district" ? `District (${selectedDistrict || "—"})` : "Rate Analysis"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Manual override toggle */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={manualOverride} onChange={e => {
                    setManualOverride(e.target.checked);
                    if (e.target.checked && effectiveRate !== null) setManualRate(String(effectiveRate));
                  }} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs text-gray-600">
                    Override rate manually
                    <span className="text-gray-600 ml-1">(use a custom value instead of the linked source)</span>
                  </span>
                </label>

                {manualOverride && (
                  <div className="flex items-center gap-2 pl-6">
                    <span className="text-xs text-gray-600">NRS</span>
                    <input type="number" min="0" step="0.01" value={manualRate}
                      onChange={e => setManualRate(e.target.value)}
                      placeholder="0.00"
                      className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="text-xs text-gray-600">/ {unit || "unit"}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <div className="text-xs text-gray-600">
            {effectiveRate !== null
              ? `Will save at NRS ${NRS(effectiveRate)} / ${unit || "unit"}`
              : "Set a base rate before saving"}
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={submit} disabled={saving || effectiveRate === null}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save Rate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
