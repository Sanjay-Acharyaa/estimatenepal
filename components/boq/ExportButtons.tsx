"use client";

import { useState, useEffect } from "react";

interface Props {
  projectId: string;
}

type ColKey = "showSno" | "showUnit" | "showQty" | "showRate" | "showAmount";

type SavedConfig = {
  showSno: boolean;
  showUnit: boolean;
  showQty: boolean;
  showRate: boolean;
  showAmount: boolean;
  customCols: string[];
  colOrder: ColKey[];
};

const DEFAULT_CONFIG: SavedConfig = {
  showSno: true,
  showUnit: true,
  showQty: true,
  showRate: true,
  showAmount: true,
  customCols: [],
  colOrder: ["showSno", "showUnit", "showQty", "showRate", "showAmount"],
};

const COL_LABELS: Record<ColKey, string> = {
  showSno: "S.No.",
  showUnit: "Unit",
  showQty: "Quantity",
  showRate: "Rate (NRS)",
  showAmount: "Amount (NRS)",
};

type ExportType = "pdf" | "excel" | "mb" | "govt";

const EXPORTS: { type: ExportType; label: string; desc: string; icon: string; colsApply: boolean }[] = [
  { type: "pdf",   label: "BOQ PDF",           desc: "Nepal-standard BOQ format, ready to print",               icon: "📄", colsApply: false },
  { type: "excel", label: "BOQ Excel",          desc: "Summary + detail sheets per discipline",                  icon: "📊", colsApply: true  },
  { type: "mb",    label: "Measurement Book",   desc: "Excel with site location, measured dates & remarks",      icon: "📐", colsApply: false },
  { type: "govt",  label: "Govt BOQ (DUDBC)",   desc: "Nepal government standard format — DUDBC/DoR submission", icon: "🏛️", colsApply: false },
];

// ── Govt export modal ─────────────────────────────────────────────────────────

function GovtModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [fields, setFields] = useState({
    ministry: "",
    department: "",
    office: "",
    schemeNo: "",
    district: "",
    ward: "",
    fiscalYear: "",
    contractorName: "",
    preparedBy: "",
    checkedBy: "",
    approvedBy: "",
  });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields(f => ({ ...f, [k]: e.target.value }));

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries(fields).forEach(([k, v]) => { if (v) params.set(k, v); });
      const res = await fetch(`/api/projects/${projectId}/boq/export/govt?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : "GovtBOQ.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  }

  const input = (label: string, k: keyof typeof fields, placeholder = "") => (
    <div key={k}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        value={fields[k]}
        onChange={set(k)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Government BOQ (DUDBC Format)</h3>
            <p className="text-xs text-gray-500 mt-0.5">Fill optional fields for the government header. All fields can be left blank.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Government Office</p>
          {input("Ministry (मन्त्रालय)", "ministry", "Ministry of Urban Development")}
          {input("Department (विभाग)", "department", "DUDBC")}
          {input("Office (कार्यालय)", "office", "Division Road Office, ...")}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Project Details</p>
          {input("Scheme No. (योजना नं.)", "schemeNo")}
          {input("District (जिल्ला)", "district")}
          {input("Ward No. (वडा नं.)", "ward")}
          {input("Fiscal Year (आ.व.)", "fiscalYear", "२०८१/०८२")}
          {input("Contractor Name (ठेकेदार)", "contractorName")}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Signatures</p>
          {input("Prepared by (तयार गर्ने)", "preparedBy")}
          {input("Checked by (जाँच गर्ने)", "checkedBy")}
          {input("Approved by (स्वीकृत)", "approvedBy")}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={download}
            disabled={downloading}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {downloading ? "Generating…" : "Download Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExportButtons({ projectId }: Props) {
  const [downloading, setDownloading]   = useState<ExportType | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [config, setConfig]             = useState<SavedConfig>(DEFAULT_CONFIG);
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState("");
  const [newColLabel, setNewColLabel]   = useState("");
  const [showGovtModal, setShowGovtModal] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.exportConfig && typeof data.exportConfig === "object") {
          setConfig({
            ...DEFAULT_CONFIG,
            ...data.exportConfig,
            colOrder: (data.exportConfig.colOrder ?? DEFAULT_CONFIG.colOrder) as ColKey[],
            customCols: data.exportConfig.customCols ?? [],
          });
        }
      })
      .catch(() => {});
  }, [projectId]);

  async function saveConfig(next: SavedConfig) {
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

  function toggleCol(key: ColKey) {
    const next = { ...config, [key]: !config[key] };
    setConfig(next);
    saveConfig(next);
  }

  function moveCol(index: number, dir: -1 | 1) {
    const order = [...config.colOrder];
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    const next = { ...config, colOrder: order };
    setConfig(next);
    saveConfig(next);
  }

  function addCustomCol() {
    const label = newColLabel.trim();
    if (!label || config.customCols.includes(label)) return;
    const next = { ...config, customCols: [...config.customCols, label] };
    setConfig(next);
    setNewColLabel("");
    saveConfig(next);
  }

  function removeCustomCol(label: string) {
    const next = { ...config, customCols: config.customCols.filter(c => c !== label) };
    setConfig(next);
    saveConfig(next);
  }

  const download = async (type: ExportType) => {
    if (type === "govt") { setShowGovtModal(true); return; }
    setDownloading(type);
    setError(null);
    try {
      let url = `/api/projects/${projectId}/boq/export/${type}`;
      if (type === "excel") {
        const params = new URLSearchParams();
        config.colOrder.forEach(k => params.set(k, config[k] ? "1" : "0"));
        if (config.customCols.length > 0) params.set("customCols", config.customCols.join(","));
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
      {showGovtModal && <GovtModal projectId={projectId} onClose={() => setShowGovtModal(false)} />}

      <p className="text-sm text-gray-500">
        Exports use the current BOQ snapshot including any approved rate overrides.
        Overridden rates are highlighted in yellow.
      </p>

      {/* ── Excel Column Config ── */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Excel Column Settings</span>
          <span className="text-xs text-gray-400">(applies to BOQ Excel export)</span>
          {saving  && <span className="text-xs text-gray-400 ml-auto">Saving…</span>}
          {saveMsg && <span className="text-xs text-green-600 ml-auto">{saveMsg}</span>}
        </div>

        {/* Standard columns — reorderable */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Column order & visibility — use arrows to reorder</p>
          <div className="space-y-1.5">
            {config.colOrder.map((key, i) => (
              <div key={key} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveCol(i, -1)}
                    disabled={i === 0}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-25 leading-none text-xs"
                    title="Move up"
                  >▲</button>
                  <button
                    onClick={() => moveCol(i, 1)}
                    disabled={i === config.colOrder.length - 1}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-25 leading-none text-xs"
                    title="Move down"
                  >▼</button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer flex-1 select-none">
                  <input
                    type="checkbox"
                    checked={config[key]}
                    onChange={() => toggleCol(key)}
                    className="accent-blue-600 w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">{COL_LABELS[key]}</span>
                </label>
              </div>
            ))}

            {/* Custom columns */}
            {config.customCols.map(label => (
              <div key={label} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <div className="w-6" />
                <span className="flex-1 text-sm text-amber-800">{label} <span className="text-xs text-amber-500">(custom)</span></span>
                <button
                  onClick={() => removeCustomCol(label)}
                  className="text-red-400 hover:text-red-600 text-xs"
                  title="Remove column"
                >✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Add custom column */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Add a custom empty column (e.g. Remarks, Drawing Ref)</p>
          <div className="flex gap-2">
            <input
              value={newColLabel}
              onChange={e => setNewColLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCustomCol()}
              placeholder="Column label…"
              maxLength={40}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addCustomCol}
              disabled={!newColLabel.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Description column is always first. Settings are saved per project.
        </p>
      </div>

      {/* ── Export Buttons ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <li>Govt BOQ (DUDBC) follows Nepal government standard submission format</li>
          <li>Custom columns appear as empty cells for manual data entry</li>
          <li>All amounts are in NRS (Nepali Rupee)</li>
        </ul>
      </div>
    </div>
  );
}
