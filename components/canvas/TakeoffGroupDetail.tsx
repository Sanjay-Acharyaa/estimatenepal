"use client";

import { useState, useEffect, useRef } from "react";
import { CatalogBrowser } from "@/components/rates/CatalogBrowser";
import type { CatalogItem } from "@/components/rates/CatalogBrowser";
import type { RateItem } from "@/components/rates/RateSelector";
import { COUNT_SHAPES } from "./TakeoffGroupDialog";
import type { CountShape } from "./TakeoffGroupDialog";
import { fmtNum } from "@/lib/format";

type TakeoffItem = {
  id: string;
  label: string;
  rawQuantity: number;
  quantity: number;
  unit: string;
  toolType: string;
  shapeType: string | null;
  pageId: string;
  isNegative: boolean;
  page?: { drawingId: string } | null;
};

type Group = {
  id: string;
  name: string;
  type: string;
  colour: string;
  lineWidth: number;
  isLocked: boolean;
  isVisible: boolean;
  tag: string | null;
  preamble: string | null;
  rateItemId: string | null;
  rateItem?: { id?: string; code: string; description?: string; unit?: string; baseRate?: number; source: string; fiscalYear?: string } | null;
  multiplier: number;
  additionalParams: Record<string, unknown> | null;
  version?: number;
  _count: { items: number };
  items?: TakeoffItem[];
};

type Drawing = { id: string; fileName: string };

type Props = {
  group: Group;
  projectId: string;
  allDrawings: Drawing[];
  onClose: () => void;
  onGroupUpdated: (g: Group) => void;
  refreshKey?: number;
  thisPageTotal?: { rawQty: number; unit: string; pageId?: string };
  sidebarWidth?: number;
};

const TYPE_LABELS: Record<string, string> = {
  LINEAR: "Linear", AREA: "Area", VERTICAL_WALL_AREA: "Vertical Wall Area",
  COUNT: "Count", COUNT_BY_DISTANCE: "Count by Distance", VOLUME: "Volume",
};

function getNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export function TakeoffGroupDetail({ group, projectId, allDrawings, onClose, onGroupUpdated, refreshKey, thisPageTotal, sidebarWidth = 224 }: Props) {
  const [tab, setTab] = useState<"main" | "params" | "drawings">("main");
  const [detail, setDetail] = useState<Group | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ multiplier?: string }>({});
  const [paramsSaved, setParamsSaved] = useState(false);
  const [showCatalogBrowser, setShowCatalogBrowser] = useState(false);
  const [showThisPage, setShowThisPage] = useState(true);
  // Track the version seen in the last GET response so it can be echoed back on PUT.
  const serverVersionRef = useRef<number | undefined>(group.version);

  useEffect(() => { setShowThisPage(true); }, [group.id]);

  // Main Details fields
  const [name, setName] = useState(group.name);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [tag, setTag] = useState(group.tag ?? "");
  const [preamble, setPreamble] = useState(group.preamble ?? "");
  const [selectedRate, setSelectedRate] = useState<RateItem | null>(
    group.rateItem ? { ...group.rateItem } as RateItem : null
  );
  const [multiplier, setMultiplier] = useState(String(group.multiplier));
  const [colour, setColour] = useState(group.colour);
  const [lineWidth, setLineWidth] = useState(group.lineWidth);
  const [countShape, setCountShape] = useState<CountShape>(
    ((group.additionalParams as any)?.countShape as CountShape) ?? "circle"
  );

  // Additional Params — Volume
  const ap = group.additionalParams as Record<string, unknown> | null;
  const [volumeMethod, setVolumeMethod] = useState<"area_x_h" | "lbh">((ap?.volumeMethod as "area_x_h" | "lbh") ?? "area_x_h");
  const initHeight = (ap?.height as Record<string, unknown> | undefined) ?? {};
  const [heightFt, setHeightFt] = useState(String(getNum(initHeight.ft)));
  const [heightIn, setHeightIn] = useState(String(getNum(initHeight.in)));
  const initBreadth = (ap?.breadth as Record<string, unknown> | undefined) ?? {};
  const [breadthFt, setBreadthFt] = useState(String(getNum(initBreadth.ft)));
  const [breadthIn, setBreadthIn] = useState(String(getNum(initBreadth.in)));

  // Additional Params — Wall height (VERTICAL_WALL_AREA)
  const initWall = (ap?.wall as Record<string, unknown> | undefined) ?? {};
  const [wallFt, setWallFt] = useState(String(getNum(initWall.heightFt)));
  const [wallIn, setWallIn] = useState(String(getNum(initWall.heightIn)));

  // Additional Params — Spacing (COUNT_BY_DISTANCE)
  const initSpacing = (ap?.spacing as Record<string, unknown> | undefined) ?? {};
  const [spacingFt, setSpacingFt] = useState(String(getNum(initSpacing.ft)));
  const [spacingIn, setSpacingIn] = useState(String(getNum(initSpacing.in)));

  useEffect(() => {
    fetch(`/api/projects/${projectId}/takeoff-groups/${group.id}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: Group) => {
        setDetail(d);
        serverVersionRef.current = d.version;
        // Sync selectedRate from server if not yet populated or if missing id (stale from old PUT)
        if (d.rateItem && (!selectedRate || !selectedRate.id)) {
          setSelectedRate(d.rateItem as RateItem);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, projectId, refreshKey]);

  function selectCatalogItem(item: CatalogItem) {
    setSelectedRate(item as RateItem);
    if (!nameManuallyEdited) {
      setName(item.description.length > 80 ? item.description.slice(0, 80) + "…" : item.description);
    }
    setShowCatalogBrowser(false);
  }

  async function handleSave() {
    const mult = parseFloat(multiplier);
    if (isNaN(mult) || mult <= 0) {
      setFieldErrors({ multiplier: "Multiplier must be a positive number." });
      return;
    }
    setFieldErrors({});
    setSaveError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/takeoff-groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, tag: tag || null, preamble: preamble.trim() || null,
          // Preserve existing link when selectedRate has no id (stale parent state from old PUT response)
          rateItemId: selectedRate === null ? null : (selectedRate.id ?? group.rateItemId ?? null),
          multiplier: mult, colour, lineWidth,
          ...((group.type === "COUNT" || group.type === "COUNT_BY_DISTANCE") && { additionalParams: { ...(group.additionalParams ?? {}), countShape } }),
          ...(serverVersionRef.current !== undefined && { version: serverVersionRef.current }),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        serverVersionRef.current = updated.version;
        onGroupUpdated(updated);
      }
      else { const d = await res.json().catch(() => ({})); setSaveError(d?.error?.message ?? "Failed to save."); }
    } catch { setSaveError("Network error."); }
    setSaving(false);
  }

  async function handleSaveParams() {
    setSaving(true); setSaveError(""); setParamsSaved(false);
    let newParams: Record<string, unknown> = { ...(ap ?? {}) };

    if (group.type === "VOLUME") {
      newParams.volumeMethod = volumeMethod;
      newParams.height = { ft: parseFloat(heightFt) || 0, in: parseFloat(heightIn) || 0 };
      if (volumeMethod === "lbh") {
        newParams.breadth = { ft: parseFloat(breadthFt) || 0, in: parseFloat(breadthIn) || 0 };
      } else {
        delete newParams.breadth;
      }
    }
    if (group.type === "VERTICAL_WALL_AREA") {
      newParams.wall = { enabled: true, heightFt: parseFloat(wallFt) || 0, heightIn: parseFloat(wallIn) || 0 };
    }
    if (group.type === "COUNT_BY_DISTANCE") {
      newParams.spacing = { ft: parseFloat(spacingFt) || 0, in: parseFloat(spacingIn) || 0 };
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/takeoff-groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          additionalParams: newParams,
          ...(serverVersionRef.current !== undefined && { version: serverVersionRef.current }),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        serverVersionRef.current = updated.version;
        onGroupUpdated(updated);
        setParamsSaved(true); setTimeout(() => setParamsSaved(false), 2000);
      }
      else { const d = await res.json().catch(() => ({})); setSaveError(d?.error?.message ?? "Failed to save."); }
    } catch { setSaveError("Network error."); }
    setSaving(false);
  }

  // For VOLUME: sum rawQuantity only for shapes matching the current method.
  // lbh = length-based shapes (POLYLINE, ARC); area_x_h = area-based shapes (RECTANGLE, CIRCLE).
  const totalRaw = detail?.items?.reduce((s, i) => {
    const signed = i.isNegative ? -(i.rawQuantity ?? 0) : (i.rawQuantity ?? 0);
    if (group.type === "VOLUME") {
      const isLengthShape = i.shapeType === "POLYLINE" || i.shapeType === "ARC";
      const isAreaShape = i.shapeType === "RECTANGLE" || i.shapeType === "CIRCLE" || i.shapeType === "POLYGON";
      if (volumeMethod === "lbh" && isLengthShape) return s + signed;
      if (volumeMethod !== "lbh" && isAreaShape) return s + signed;
      return s;
    }
    return s + signed;
  }, 0) ?? 0;
  const currentMult = parseFloat(multiplier) || group.multiplier;
  const currentH = (parseFloat(heightFt) || 0) + (parseFloat(heightIn) || 0) / 12;
  const currentB = (parseFloat(breadthFt) || 0) + (parseFloat(breadthIn) || 0) / 12;
  const currentSpacing = (parseFloat(spacingFt) || 0) + (parseFloat(spacingIn) || 0) / 12;
  const currentWallH = (parseFloat(wallFt) || 0) + (parseFloat(wallIn) || 0) / 12;

  function applyFormula(raw: number, baseUnit: string): { qty: number; unit: string } {
    // Params (height, breadth, spacing, wallH) are stored as ft+in; convert to drawing unit.
    const drawingFt = baseUnit === "" || baseUnit.includes("ft");
    const ftu = drawingFt ? 1 : 0.3048;
    if (group.type === "VOLUME") {
      const hU = currentH * ftu;
      const bU = currentB * ftu;
      const cuUnit = drawingFt ? "cu ft" : "cu m";
      if (volumeMethod === "lbh") return { qty: raw * bU * hU * currentMult, unit: bU > 0 && hU > 0 ? cuUnit : "(set breadth+height)" };
      return { qty: raw * hU * currentMult, unit: hU > 0 ? cuUnit : "(set height)" };
    }
    if (group.type === "COUNT_BY_DISTANCE") {
      const spacingU = currentSpacing * ftu;
      if (spacingU > 0) return { qty: (Math.ceil(raw / spacingU - 1e-9) + 1) * currentMult, unit: "each" };
      return { qty: raw * currentMult, unit: "(set spacing)" };
    }
    if (group.type === "VERTICAL_WALL_AREA") {
      const wallHU = currentWallH * ftu;
      const sqUnit = drawingFt ? "sq ft" : "sq m";
      const lenUnit = drawingFt ? "ft" : "m";
      return { qty: wallHU > 0 ? raw * wallHU * currentMult : raw * currentMult, unit: wallHU > 0 ? sqUnit : `${lenUnit} (set wall height)` };
    }
    return { qty: raw * currentMult, unit: baseUnit };
  }

  const allPagesBaseUnit = detail?.items?.[0]?.unit
    ?.replace(" (set height)", "").replace(" (set breadth+height)", "")
    .replace(" (set spacing)", "").replace(" (set wall height)", "") ?? "";

  // Unit labels for the drawing's native scale unit (derived from first item).
  const isDrawingFt = allPagesBaseUnit === "" || allPagesBaseUnit.includes("ft");
  const ftToUnit = isDrawingFt ? 1 : 0.3048;
  const lenUnit = isDrawingFt ? "ft" : "m";
  const sqUnit = isDrawingFt ? "sq ft" : "sq m";
  const cuUnit = isDrawingFt ? "cu ft" : "cu m";
  // Parameter values converted to the drawing's scale unit (for formula display strings).
  const currentHInUnit = currentH * ftToUnit;
  const currentBInUnit = currentB * ftToUnit;
  const currentSpacingInUnit = currentSpacing * ftToUnit;
  const currentWallHInUnit = currentWallH * ftToUnit;
  // COUNT_BY_DISTANCE: mirror BOQ per-item fence-post using detail.items when available,
  // so the panel total matches the BOQ export exactly. Falls back to applyFormula
  // (aggregate) while detail is still loading (items not yet fetched).
  const { qty: displayTotal, unit: qtyUnit } = (() => {
    if (group.type === "COUNT_BY_DISTANCE" && detail?.items && detail.items.length > 0) {
      if (!currentSpacing) return { qty: totalRaw * currentMult, unit: `${allPagesBaseUnit || "unit"} (set spacing)` };
      let total = 0;
      for (const item of detail.items) {
        const signedRaw = item.isNegative ? -item.rawQuantity : item.rawQuantity;
        const ftu = item.unit.includes("ft") ? 1 : 0.3048;
        const spacing = currentSpacing * ftu;
        const closedShape = item.shapeType === "RECTANGLE" || item.shapeType === "POLYGON" || item.shapeType === "CIRCLE";
        const absSignedRaw = Math.abs(signedRaw);
        const cnt = Math.ceil(absSignedRaw / spacing - 1e-9) + (closedShape ? 0 : 1);
        const count = signedRaw >= 0 ? cnt : -cnt;
        total += count * currentMult;
      }
      return { qty: total, unit: "each" };
    }
    return applyFormula(totalRaw, allPagesBaseUnit);
  })();

  const thisPageBaseUnit = thisPageTotal?.unit ?? allPagesBaseUnit;
  const { qty: thisPageDisplay, unit: thisPageUnit } = (() => {
    if (group.type === "COUNT_BY_DISTANCE" && thisPageTotal?.pageId && detail?.items && detail.items.length > 0) {
      if (!currentSpacing) return { qty: (thisPageTotal.rawQty ?? 0) * currentMult, unit: `${thisPageBaseUnit || "unit"} (set spacing)` };
      let total = 0;
      for (const item of detail.items.filter(i => i.pageId === thisPageTotal.pageId)) {
        const signedRaw = item.isNegative ? -item.rawQuantity : item.rawQuantity;
        const ftu = item.unit.includes("ft") ? 1 : 0.3048;
        const spacing = currentSpacing * ftu;
        const closedShape = item.shapeType === "RECTANGLE" || item.shapeType === "POLYGON" || item.shapeType === "CIRCLE";
        const absSignedRaw2 = Math.abs(signedRaw);
        const cnt2 = Math.ceil(absSignedRaw2 / spacing - 1e-9) + (closedShape ? 0 : 1);
        const count = signedRaw >= 0 ? cnt2 : -cnt2;
        total += count * currentMult;
      }
      return { qty: total, unit: "each" };
    }
    // When unit is "each" the server already computed the count — multiplying by spacing again
    // (inside applyFormula) would double-apply fence-post. Return the count directly.
    if (group.type === "COUNT_BY_DISTANCE" && thisPageBaseUnit === "each") {
      return { qty: (thisPageTotal?.rawQty ?? 0) * currentMult, unit: "each" };
    }
    return applyFormula(thisPageTotal?.rawQty ?? 0, thisPageBaseUnit);
  })();

  const itemCount = detail?._count.items ?? group._count.items;

  const hasParams = group.type === "VOLUME" || group.type === "VERTICAL_WALL_AREA" || group.type === "COUNT_BY_DISTANCE";

  return (
    <>
    <div className="fixed top-0 bottom-0 w-80 bg-white shadow-2xl border-l border-gray-200 z-40 flex flex-col" style={{ left: sidebarWidth }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true" className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.colour }} />
          <span className="text-sm font-semibold text-gray-800 truncate">{group.name}</span>
        </div>
        <button onClick={onClose} aria-label="Close layer details" className="text-gray-600 hover:text-gray-600 text-xl leading-none ml-2">×</button>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Layer detail sections" className="flex border-b border-gray-200 text-xs font-medium">
        {(["main", "params", "drawings"] as const).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 transition ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
            {t === "main" ? "Main Details" : t === "params" ? "Add. Params" : "Drawings"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-track]:bg-transparent">
        {/* ── Main Details ── */}
        {tab === "main" && (
          <div className="space-y-3">
            {saveError && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded">{saveError}</p>}

            <div>
              <label className="block text-xs text-gray-500 mb-1">Takeoff Type</label>
              <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {TYPE_LABELS[group.type] ?? group.type}
              </div>
            </div>

            {/* ── Catalog Item (Procore-style) ── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-gray-500">Catalog Item</label>
                {selectedRate && (
                  <button
                    onClick={() => setShowCatalogBrowser(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
                  >
                    Change
                  </button>
                )}
              </div>

              {selectedRate ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-gray-700 bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                          {selectedRate.code}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          selectedRate.source === "DUDBC" ? "bg-green-100 text-green-700" :
                          selectedRate.source === "DISTRICT" ? "bg-yellow-100 text-yellow-700" :
                          "bg-blue-100 text-blue-700"
                        }`}>
                          {selectedRate.source}
                        </span>
                        {selectedRate.fiscalYear && (
                          <span className="text-xs text-gray-600">FY {selectedRate.fiscalYear}</span>
                        )}
                      </div>
                      {selectedRate.description && (
                        <p className="text-xs text-gray-800 leading-snug">{selectedRate.description}</p>
                      )}
                      <p className="text-xs font-semibold text-blue-700 mt-1.5">
                        {selectedRate.baseRate != null
                          ? `NRS ${fmtNum(selectedRate.baseRate, 2)} / ${selectedRate.unit ?? ""}`
                          : selectedRate.unit ? `per ${selectedRate.unit}` : "Rate not set"}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedRate(null)}
                      className="text-gray-600 hover:text-red-500 text-sm flex-shrink-0 mt-0.5"
                      aria-label="Unlink catalog item"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCatalogBrowser(true)}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 rounded-lg px-3 py-3 text-sm text-gray-500 hover:text-blue-600 transition"
                >
                  <span className="text-base">🔗</span>
                  Link Catalog Item
                </button>
              )}
            </div>

            <div>
              <label htmlFor="tgdd-name" className="block text-xs text-gray-700 mb-1">Display Name</label>
              <input id="tgdd-name" value={name} onChange={e => { setName(e.target.value); setNameManuallyEdited(true); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="tgdd-color" className="block text-xs text-gray-700 mb-1">Color</label>
                <input id="tgdd-color" type="color" value={colour} onChange={e => setColour(e.target.value)}
                  className="w-full h-8 rounded border border-gray-300 cursor-pointer" />
              </div>
              <div className="flex-1">
                <label htmlFor="tgdd-line-width" className="block text-xs text-gray-700 mb-1">
                  {(group.type === "COUNT" || group.type === "COUNT_BY_DISTANCE") ? "Dot Size" : "Line Width"}
                </label>
                <input id="tgdd-line-width" type="range" min={1} max={8} step={1} value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))}
                  className="w-full mt-2 accent-blue-600" />
                <span className="text-xs text-gray-700" aria-live="polite">{lineWidth}</span>
              </div>
            </div>

            {/* Marker Shape — COUNT and COUNT_BY_DISTANCE */}
            {(group.type === "COUNT" || group.type === "COUNT_BY_DISTANCE") && (
              <div>
                <label className="block text-xs text-gray-700 mb-2">Marker Shape</label>
                <div className="flex gap-1.5" role="group" aria-label="Select marker shape">
                  {COUNT_SHAPES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      aria-label={s.title}
                      aria-pressed={countShape === s.value}
                      onClick={() => setCountShape(s.value)}
                      style={{ color: countShape === s.value ? colour : undefined }}
                      className={`flex-1 py-1.5 text-base rounded-lg border-2 transition ${
                        countShape === s.value
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 text-gray-600"
                      }`}
                    >
                      <span aria-hidden="true">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="tgdd-tag" className="block text-xs text-gray-700 mb-1">Tag</label>
              <input id="tgdd-tag" value={tag} onChange={e => setTag(e.target.value)} placeholder={'e.g. AFF 18\'-9"'}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label htmlFor="tgdd-preamble" className="block text-xs text-gray-700 mb-1">
                Preamble
                <span className="text-gray-600 font-normal ml-1">(shown in BOQ under item name)</span>
              </label>
              <textarea id="tgdd-preamble" value={preamble} onChange={e => setPreamble(e.target.value)}
                rows={2} placeholder="e.g. Measured net in place. Deduct openings &gt; 1 m²."
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            <div>
              <label htmlFor="tgdd-multiplier" className="block text-xs text-gray-700 mb-1">
                Multiplier
                <span className="text-gray-600 font-normal ml-1">(e.g. 3 identical footings)</span>
              </label>
              <input
                id="tgdd-multiplier"
                type="number"
                min="0.001"
                step="0.1"
                value={multiplier}
                onChange={e => { setMultiplier(e.target.value); setFieldErrors({}); }}
                aria-describedby={fieldErrors.multiplier ? "tgdd-multiplier-err" : undefined}
                aria-invalid={!!fieldErrors.multiplier}
                className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ${fieldErrors.multiplier ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-blue-500"}`}
              />
              {fieldErrors.multiplier && <p id="tgdd-multiplier-err" role="alert" className="text-red-600 text-xs mt-1">{fieldErrors.multiplier}</p>}
            </div>

            {/* ── This page total (dismissable) ── */}
            {thisPageTotal && showThisPage && (
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs text-gray-600 mb-0.5">This page</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {thisPageUnit === "each" ? String(Math.round(thisPageDisplay)) : thisPageDisplay.toFixed(2)}
                    <span className="text-xs font-normal text-gray-600 ml-1">{thisPageUnit}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowThisPage(false)}
                  className="text-gray-500 hover:text-gray-700 text-base leading-none ml-4 flex-shrink-0"
                  aria-label="Hide this page total"
                >
                  ✕
                </button>
              </div>
            )}

            {/* ── All pages total ── */}
            {detail && (
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">{itemCount} shape{itemCount !== 1 ? "s" : ""}</p>
                  <span className="text-xs text-blue-500 font-medium">All pages total</span>
                </div>
                <p className="text-xl font-bold text-gray-800">
                  {qtyUnit === "each" ? String(Math.round(displayTotal)) : displayTotal.toFixed(2)}
                  <span className="text-sm font-normal text-gray-500 ml-1">{qtyUnit}</span>
                </p>
                {group.type === "VOLUME" && currentHInUnit > 0 ? (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {volumeMethod === "lbh"
                      ? `${totalRaw.toFixed(2)} ${lenUnit} × ${currentBInUnit.toFixed(3)} ${lenUnit} × ${currentHInUnit.toFixed(3)} ${lenUnit}${currentMult !== 1 ? ` × ${currentMult}` : ""} = ${displayTotal.toFixed(2)} ${cuUnit}`
                      : `${totalRaw.toFixed(2)} ${sqUnit} × ${currentHInUnit.toFixed(3)} ${lenUnit}${currentMult !== 1 ? ` × ${currentMult}` : ""} = ${displayTotal.toFixed(2)} ${cuUnit}`
                    }
                  </p>
                ) : group.type === "VERTICAL_WALL_AREA" && currentWallHInUnit > 0 ? (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {`${totalRaw.toFixed(2)} ${lenUnit} × ${currentWallHInUnit.toFixed(3)} ${lenUnit} (wall)${currentMult !== 1 ? ` × ${currentMult}` : ""} = ${displayTotal.toFixed(2)} ${sqUnit}`}
                  </p>
                ) : group.type === "COUNT_BY_DISTANCE" && currentSpacingInUnit > 0 ? (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {`${itemCount} segment${itemCount !== 1 ? "s" : ""}, per-segment count${currentMult !== 1 ? ` × ${currentMult}` : ""} = ${displayTotal} items`}
                  </p>
                ) : currentMult !== 1 ? (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {`${totalRaw.toFixed(2)} ${qtyUnit} × ${currentMult} = ${displayTotal.toFixed(2)}`}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* ── Additional Parameters ── */}
        {tab === "params" && (
          <div className="space-y-4">
            {saveError && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded">{saveError}</p>}
            {paramsSaved && <p role="status" className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-1.5 rounded">Saved — new shapes will use this value.</p>}

            {group.type === "VOLUME" && (
              <div className="space-y-3">
                {/* Method toggle */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Calculation Method</label>
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs" role="group" aria-label="Volume calculation method">
                    <button
                      aria-pressed={volumeMethod === "area_x_h"}
                      onClick={() => setVolumeMethod("area_x_h")}
                      className={`flex-1 py-1.5 transition ${volumeMethod === "area_x_h" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >Area × Height</button>
                    <button
                      aria-pressed={volumeMethod === "lbh"}
                      onClick={() => setVolumeMethod("lbh")}
                      className={`flex-1 py-1.5 border-l border-gray-300 transition ${volumeMethod === "lbh" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >L × B × H</button>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {volumeMethod === "area_x_h"
                      ? "Draw a rectangle → area × height = volume"
                      : "Draw a polyline (length) → length × breadth × height = volume"}
                  </p>
                  {/* BUG 28: warn about mismatched shapes */}
                  {(() => {
                    const items = detail?.items ?? [];
                    const mismatchedCount = items.filter(i => {
                      const st = i.shapeType;
                      const isLengthShape = st === "POLYLINE" || st === "ARC";
                      const isAreaShape = st === "RECTANGLE" || st === "CIRCLE" || st === "POLYGON";
                      // null shapeType (legacy items without geometry tag) mirrors computeGroupTotal:
                      // excluded from both methods, so always counts as mismatched.
                      if (st === null) return true;
                      if (volumeMethod === "lbh") return !isLengthShape;
                      return !isAreaShape;
                    }).length;
                    if (mismatchedCount === 0) return null;
                    const correctShape = volumeMethod === "lbh" ? "polylines" : "rectangles or polygons";
                    return (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
                        ⚠ {mismatchedCount} existing shape{mismatchedCount !== 1 ? "s" : ""} {mismatchedCount !== 1 ? "are" : "is"} excluded because {mismatchedCount !== 1 ? "they don't" : "it doesn't"} match the selected method. Delete and redraw {mismatchedCount !== 1 ? "them" : "it"} as {correctShape} to include {mismatchedCount !== 1 ? "them" : "it"}.
                      </p>
                    );
                  })()}
                </div>

                {/* Height */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {volumeMethod === "lbh" ? "Height" : "Depth / Height"}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Feet</label>
                      <input type="number" min="0" step="1" value={heightFt} onChange={e => setHeightFt(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Inches</label>
                      <input type="number" min="0" max="11" step="1" value={heightIn} onChange={e => setHeightIn(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    </div>
                  </div>
                  {currentHInUnit > 0 && <p className="text-xs text-blue-600 mt-1">= {currentHInUnit.toFixed(3)} {lenUnit}</p>}
                </div>

                {/* Breadth — only for LBH */}
                {volumeMethod === "lbh" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Breadth / Width</label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Feet</label>
                        <input type="number" min="0" step="1" value={breadthFt} onChange={e => setBreadthFt(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Inches</label>
                        <input type="number" min="0" max="11" step="1" value={breadthIn} onChange={e => setBreadthIn(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                      </div>
                    </div>
                    {currentBInUnit > 0 && <p className="text-xs text-blue-600 mt-1">= {currentBInUnit.toFixed(3)} {lenUnit}</p>}
                  </div>
                )}

                {/* Live preview */}
                {totalRaw > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-500 mb-0.5">Live preview ({itemCount} shape{itemCount !== 1 ? "s" : ""})</p>
                    <p className="text-base font-bold text-gray-800">
                      {displayTotal.toFixed(3)} <span className="text-sm font-normal text-gray-500">{qtyUnit}</span>
                    </p>
                    {currentHInUnit > 0 && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        {volumeMethod === "lbh"
                          ? `${totalRaw.toFixed(2)} ${lenUnit} × ${currentBInUnit.toFixed(3)} ${lenUnit} × ${currentHInUnit.toFixed(3)} ${lenUnit}${currentMult !== 1 ? ` × ${currentMult}` : ""} = ${displayTotal.toFixed(3)} ${cuUnit}`
                          : `${totalRaw.toFixed(2)} ${sqUnit} × ${currentHInUnit.toFixed(3)} ${lenUnit}${currentMult !== 1 ? ` × ${currentMult}` : ""} = ${displayTotal.toFixed(3)} ${cuUnit}`
                        }
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-600">Changing these values updates the total immediately. New shapes drawn after saving will use these dimensions.</p>
              </div>
            )}

            {group.type === "VERTICAL_WALL_AREA" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Wall Height</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Feet</label>
                      <input type="number" min="0" step="1" value={wallFt} onChange={e => setWallFt(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Inches</label>
                      <input type="number" min="0" max="11" step="1" value={wallIn} onChange={e => setWallIn(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    </div>
                  </div>
                  {currentWallHInUnit > 0 && <p className="text-xs text-blue-600 mt-1">= {currentWallHInUnit.toFixed(3)} {lenUnit}</p>}
                </div>
                {totalRaw > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-500 mb-0.5">Live preview ({itemCount} shape{itemCount !== 1 ? "s" : ""})</p>
                    <p className="text-base font-bold text-gray-800">
                      {currentWallHInUnit > 0
                        ? <>{(totalRaw * currentWallHInUnit * currentMult).toFixed(2)} <span className="text-sm font-normal text-gray-500">{sqUnit}</span></>
                        : <>{totalRaw.toFixed(2)} <span className="text-sm font-normal text-gray-500">{lenUnit} (set wall height)</span></>
                      }
                    </p>
                    {currentWallHInUnit > 0 && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        {`${totalRaw.toFixed(2)} ${lenUnit} (perimeter) × ${currentWallHInUnit.toFixed(3)} ${lenUnit} (height)${currentMult !== 1 ? ` × ${currentMult}` : ""} = ${(totalRaw * currentWallHInUnit * currentMult).toFixed(2)} ${sqUnit}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {group.type === "COUNT_BY_DISTANCE" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Item Spacing
                    <span className="text-gray-600 font-normal ml-1">(e.g. J-hooks every 4 ft)</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Feet</label>
                      <input type="number" min="0" step="1" value={spacingFt} onChange={e => setSpacingFt(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Inches</label>
                      <input type="number" min="0" max="11" step="1" value={spacingIn} onChange={e => setSpacingIn(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                    </div>
                  </div>
                  {currentSpacingInUnit > 0 && <p className="text-xs text-blue-600 mt-1">= {currentSpacingInUnit.toFixed(3)} {lenUnit} per item</p>}
                </div>

                {totalRaw > 0 && (() => {
                  // Per-item fence-post when items are loaded — matches BOQ exactly.
                  // Falls back to aggregate (totalRaw) while detail.items is still fetching.
                  let previewCount: number | null = null;
                  if (currentSpacingInUnit > 0 && detail?.items && detail.items.length > 0) {
                    let total = 0;
                    for (const item of detail.items) {
                      const signedRaw = item.isNegative ? -item.rawQuantity : item.rawQuantity;
                      const ftu = item.unit.includes("ft") ? 1 : 0.3048;
                      const spacing = currentSpacing * ftu;
                      if (spacing > 0) {
                        const closedShape = item.shapeType === "RECTANGLE" || item.shapeType === "POLYGON" || item.shapeType === "CIRCLE";
                        const absRaw3 = Math.abs(signedRaw);
                        const cnt3 = Math.ceil(absRaw3 / spacing - 1e-9) + (closedShape ? 0 : 1);
                        total += signedRaw >= 0 ? cnt3 : -cnt3;
                      }
                    }
                    previewCount = total * currentMult;
                  }
                  return (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-500 mb-0.5">Live preview ({itemCount} shape{itemCount !== 1 ? "s" : ""})</p>
                      <p className="text-base font-bold text-gray-800">
                        {currentSpacingInUnit > 0
                          ? <>{previewCount ?? (Math.floor(totalRaw / currentSpacingInUnit) + 1) * currentMult} <span className="text-sm font-normal text-gray-500">each</span></>
                          : <>{totalRaw.toFixed(2)} <span className="text-sm font-normal text-gray-500">{lenUnit} (set spacing)</span></>
                        }
                      </p>
                      {currentSpacingInUnit > 0 && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          {previewCount != null
                            ? `${itemCount} segment${itemCount !== 1 ? "s" : ""}, per-segment ⌊len ÷ spacing⌋ + 1${currentMult !== 1 ? ` × ${currentMult}` : ""} = ${previewCount} items`
                            : `${totalRaw.toFixed(2)} ${lenUnit} ÷ ${currentSpacingInUnit.toFixed(3)} ${lenUnit} = ${Math.floor(totalRaw / currentSpacingInUnit) + 1} items${currentMult !== 1 ? ` × ${currentMult} = ${(Math.floor(totalRaw / currentSpacingInUnit) + 1) * currentMult}` : ""}`
                          }
                        </p>
                      )}
                    </div>
                  );
                })()}
                <p className="text-xs text-gray-600">
                  Count per segment = ⌊ segment length ÷ spacing ⌋ + 1. Total = sum across all segments.
                </p>
              </div>
            )}

            {!hasParams && (
              <p className="text-center py-8 text-gray-600 text-xs">
                No additional parameters for {TYPE_LABELS[group.type] ?? group.type} type.
              </p>
            )}

            {hasParams && (
              <button onClick={handleSaveParams} disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition disabled:opacity-50">
                {saving ? "Saving…" : "Save Parameters"}
              </button>
            )}
          </div>
        )}

        {/* ── Drawings ── */}
        {tab === "drawings" && (() => {
          if (!detail) {
            return (
              <div className="space-y-1">
                <p className="text-xs text-gray-600 mb-3">Drawings containing shapes from this layer.</p>
                <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
              </div>
            );
          }
          // Count items per drawing using the page→drawing mapping included in detail.items.
          const countByDrawing = new Map<string, number>();
          for (const item of detail.items ?? []) {
            const did = item.page?.drawingId;
            if (did) countByDrawing.set(did, (countByDrawing.get(did) ?? 0) + 1);
          }
          const drawingsWithShapes = allDrawings.filter(d => (countByDrawing.get(d.id) ?? 0) > 0);
          return (
            <div className="space-y-1">
              <p className="text-xs text-gray-600 mb-3">Drawings containing shapes from this layer.</p>
              {drawingsWithShapes.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-4">No shapes placed in any drawing.</p>
              ) : (
                drawingsWithShapes.map(d => {
                  const cnt = countByDrawing.get(d.id) ?? 0;
                  return (
                    <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                      <a href={`/dashboard/projects/${projectId}/drawings/${d.id}`}
                        className="text-xs text-blue-600 hover:underline truncate flex-1 mr-2">{d.fileName}</a>
                      <span className="text-xs text-gray-500">{cnt} shape{cnt !== 1 ? "s" : ""}</span>
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}
      </div>

      {/* Footer — only Main Details has a save button */}
      {tab === "main" && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose}
            className="px-3 py-2 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
        </div>
      )}
    </div>

    {showCatalogBrowser && (
      <CatalogBrowser
        onSelect={selectCatalogItem}
        onClose={() => setShowCatalogBrowser(false)}
      />
    )}
    </>
  );
}
