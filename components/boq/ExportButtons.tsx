"use client";

import { useState } from "react";

interface Props {
  projectId: string;
}

type ExportType = "pdf" | "excel" | "mb";

const EXPORTS: { type: ExportType; label: string; desc: string; icon: string }[] = [
  {
    type: "pdf",
    label: "BOQ PDF",
    desc: "Nepal-standard BOQ format, ready to print",
    icon: "📄",
  },
  {
    type: "excel",
    label: "BOQ Excel",
    desc: "Summary + detail sheets per discipline",
    icon: "📊",
  },
  {
    type: "mb",
    label: "Measurement Book",
    desc: "Excel with site location, measured dates & remarks",
    icon: "📐",
  },
];

export function ExportButtons({ projectId }: Props) {
  const [downloading, setDownloading] = useState<ExportType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (type: ExportType) => {
    setDownloading(type);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/boq/export/${type}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `export.${type === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Exports use the current BOQ snapshot including any approved rate overrides.
        Overridden rates are highlighted in yellow.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {EXPORTS.map(({ type, label, desc, icon }) => (
          <button
            key={type}
            onClick={() => download(type)}
            disabled={!!downloading}
            className="flex flex-col items-center gap-2 p-6 border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <span className="text-3xl">{icon}</span>
            <span className="font-semibold text-gray-800 group-hover:text-blue-700">
              {downloading === type ? "Downloading…" : label}
            </span>
            <span className="text-xs text-gray-500 text-center">{desc}</span>
            {downloading === type && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
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
        </ul>
      </div>
    </div>
  );
}
