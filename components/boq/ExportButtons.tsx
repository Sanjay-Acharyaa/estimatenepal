"use client";

import { useState, useEffect } from "react";

interface Props {
  projectId: string;
}

type ExportType = "pdf" | "excel" | "mb";

type ColConfig = {
  showSno: boolean;
  showUnit: boolean;
  showQty: boolean;
  showRate: boolean;
  showAmount: boolean;
};

const DEFAULT_COLS: ColConfig = {
  showSno: true, showUnit: true, showQty: true, showRate: true, showAmount: true,
};

const COL_LABELS: { key: keyof ColConfig; label: string }[] = [
  { key: "showSno",    label: "S.No." },
  { key: "showUnit",   label: "Unit" },
  { key: "showQty",    label: "Quantity" },
  { key: "showRate",   label: "Rate (NRS)" },
  { key: "showAmount", label: "Amount (NRS)" },
];

const EXPORTS: { type: ExportType; label: string; desc: string; icon: string; colsApply: boolean }[] = [
  { type: "pdf",   label: "BOQ PDF",          desc: "Nepal-standard BOQ format, ready to print", icon: "📄", colsApply: false },
  { type: "excel", label: "BOQ Excel",         desc: "Summary + detail sheets per discipline",    icon: "📊", colsApply: true  },
  { type: "mb",    label: "Measurement Book",  desc: "Excel with site location, measured dates & remarks", icon: "📐", colsApply: false },
];

export function ExportButtons({ projectId }: Props) {
  const [downloading, setDownloading] = useState<ExportType | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [cols, setCols]               = useState<ColConfig>(DEFAULT_COLS);
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState("");

  // Load saved exportConfig from project
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.exportConfig && typeof data.exportConfig === "object") {
          setCols({ ...DEFAULT_COLS, ...data.exportConfig });
        }
      })
      .catch(() => {});
  }, [projectId]);

  async function saveColConfig(next: ColConfig) {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportConfig: next }),
      });
      if (res.ok) setSaveMsg("Saved");
    } catch {
      setSaveMsg("Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 2000);
    }
  }

  function toggleCol(key: keyof ColConfig) {
    const next = { ...cols, [key]: !cols[key] };
    setCols(next);
    saveColConfig(next);
  }

  const download = async (type: ExportType) => {
    setDownloading(type);
    setError(null);
    try {
      let url = `/api/projects/${projectId}/boq/export/${type}`;
      if (type === "excel") {
        const params = new URLSearchParams({
          showSno:    cols.showSno    ? "1" : "0",
          showUnit:   cols.showUnit   ? "1" : "0",
          showQty:    cols.showQty    ? "1" : "0",
          showRate:   cols.showRate   ? "1" : "0",
          showAmount: cols.showAmount ? "1" : "0",
        });
        url += `?${params}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `export.${type === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Exports use the current BOQ snapshot including any approved rate overrides.
        Overridden rates are highlighted in yellow.
      </p>

      {/* Column visibility (Excel only) */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-700">Excel Column Visibility</span>
          {saving && <span className="text-xs text-gray-400">Saving…</span>}
          {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
        </div>
        <div className="flex flex-wrap gap-3">
          {COL_LABELS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cols[key]}
                onChange={() => toggleCol(key)}
                className="accent-blue-600 w-4 h-4"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Description column is always included. Settings are saved per project.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {EXPORTS.map(({ type, label, desc, icon, colsApply }) => (
          <button
            key={type}
            onClick={() => download(type)}
            disabled={!!downloading}
            className="flex flex-col items-center gap-2 p-6 border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <span className="text-3xl" aria-hidden>{icon}</span>
            <span className="font-semibold text-gray-800 group-hover:text-blue-700">
              {downloading === type ? "Downloading…" : label}
            </span>
            <span className="text-xs text-gray-500 text-center">{desc}</span>
            {colsApply && (
              <span className="text-xs text-blue-400">Uses column settings above</span>
            )}
            {downloading === type && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">Export notes</p>
        <ul className="space-y-1 text-xs text-blue-700 list-disc list-inside">
          <li>PDF generation may take 10–30 seconds for large BOQs</li>
          <li>Excel files open in Microsoft Excel or LibreOffice Calc</li>
          <li>Measurement Book includes site-level breakdown for field verification</li>
          <li>All amounts are in NRS (Nepali Rupee)</li>
          <li>Hide the Rate column when sharing BOQ with clients for blind tender bids</li>
        </ul>
      </div>
    </div>
  );
}
