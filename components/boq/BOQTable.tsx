"use client";

import { useState, useEffect } from "react";
import type { BOQDocument, BOQGroup } from "@/lib/boq";
import { OverrideDialog } from "./OverrideDialog";
import { fmtNum } from "@/lib/format";

const NRS = (n: number) => fmtNum(n, 2);

const qty = (n: number, isCount = false) =>
  isCount && Number.isInteger(n)
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

interface Props {
  projectId: string;
  isAdmin: boolean;
}

export function BOQTable({ projectId, isAdmin }: Props) {
  const [boq, setBoq] = useState<BOQDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [overrideTarget, setOverrideTarget] = useState<BOQGroup | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/boq`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Server error ${res.status}`);
      }
      const data = await res.json();
      setBoq(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400 text-sm">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
        Generating BOQ…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="text-center py-10">
        <p className="text-red-500 text-sm mb-3">{error}</p>
        <button onClick={load} className="text-sm text-blue-600 underline">Retry</button>
      </div>
    );
  }

  if (!boq) return null;

  const hasAnyItems = boq.disciplines.some((d) => d.groups.length > 0);

  return (
    <div className="overflow-x-auto">
      {!hasAnyItems && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">
          No takeoff items yet. Add items on the drawing canvas first.
        </div>
      )}

      {hasAnyItems && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-blue-900 dark:bg-blue-950 text-white">
              <th className="px-3 py-2 text-left w-10">S.No.</th>
              <th className="px-3 py-2 text-left">Description of Work</th>
              <th className="px-3 py-2 text-right w-20">No.</th>
              <th className="px-3 py-2 text-right w-24">Length</th>
              <th className="px-3 py-2 text-right w-24">Breadth</th>
              <th className="px-3 py-2 text-right w-24">Height</th>
              <th className="px-3 py-2 text-right w-24">Quantity</th>
              <th className="px-3 py-2 text-center w-16">Unit</th>
              <th className="px-3 py-2 text-right w-32">Rate (NRS)</th>
              <th className="px-3 py-2 text-right w-36">Amount (NRS)</th>
            </tr>
          </thead>
          <tbody>
            {boq.disciplines.map((disc, di) => (
              disc.groups.length > 0 && (
                <DisciplineSection
                  key={disc.id}
                  disc={disc}
                  dIdx={di + 1}
                  expandedGroups={expandedGroups}
                  onToggleGroup={toggleGroup}
                  isAdmin={isAdmin}
                  onProposeOverride={(grp) => setOverrideTarget(grp)}
                />
              )
            ))}

            {/* Financial Summary */}
            <tr><td colSpan={10} className="py-2" /></tr>
            <FinRow label="Grand Total" value={boq.grandTotal} bold />
            {boq.project.contingencyPct > 0 && (
              <FinRow label={`Contingency (${boq.project.contingencyPct}%)`} value={boq.contingencyAmount} />
            )}
            {boq.provisionalSum > 0 && (
              <FinRow label="Provisional Sum" value={boq.provisionalSum} />
            )}
            {(boq.project.vatEnabled || boq.project.tdsEnabled) && (
              <FinRow label="Sub-Total (VAT Base)" value={boq.subtotalAfterAdditions} />
            )}
            {boq.project.vatEnabled && (
              <FinRow label={`VAT (${boq.project.vatRate}%)`} value={boq.vatAmount} />
            )}
            {boq.project.tdsEnabled && (
              <FinRow label={`TDS (${boq.project.tdsRate}%)`} value={boq.tdsAmount} deduction />
            )}
            <FinRow label="FINAL PAYABLE (NRS)" value={boq.finalPayable} bold highlight />
          </tbody>
        </table>
      )}

      {overrideTarget && (
        <OverrideDialog
          projectId={projectId}
          group={overrideTarget}
          onClose={() => setOverrideTarget(null)}
          onSuccess={() => { setOverrideTarget(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Discipline Section ────────────────────────────────────────────────────────

function DisciplineSection({
  disc,
  dIdx,
  expandedGroups,
  onToggleGroup,
  isAdmin,
  onProposeOverride,
}: {
  disc: BOQDocument["disciplines"][0];
  dIdx: number;
  expandedGroups: Set<string>;
  onToggleGroup: (id: string) => void;
  isAdmin: boolean;
  onProposeOverride: (grp: BOQGroup) => void;
}) {
  return (
    <>
      {/* Discipline header */}
      <tr className="bg-blue-600 dark:bg-blue-800 text-white">
        <td colSpan={10} className="px-3 py-2 font-bold text-sm uppercase">
          {disc.name}
        </td>
      </tr>

      {disc.groups.map((grp, gi) => (
        <GroupRows
          key={grp.id}
          grp={grp}
          sno={`${dIdx}.${gi + 1}`}
          expanded={expandedGroups.has(grp.id)}
          onToggle={() => onToggleGroup(grp.id)}
          isAdmin={isAdmin}
          onProposeOverride={() => onProposeOverride(grp)}
        />
      ))}

      {/* Discipline subtotal */}
      <tr className="bg-blue-50 dark:bg-blue-900/20 border-t-2 border-blue-200 dark:border-blue-700">
        <td colSpan={9} className="px-3 py-2 text-right font-semibold text-blue-800 dark:text-blue-300 text-sm">
          {disc.name} Sub-Total
        </td>
        <td className="px-3 py-2 text-right font-bold text-blue-900 dark:text-blue-200 text-sm">
          NRS {NRS(disc.subtotal)}
        </td>
      </tr>
      <tr><td colSpan={10} className="py-1 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700" /></tr>
    </>
  );
}

// ─── Group rows ────────────────────────────────────────────────────────────────

function GroupRows({
  grp,
  sno,
  expanded,
  onToggle,
  isAdmin,
  onProposeOverride,
}: {
  grp: BOQGroup;
  sno: string;
  expanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onProposeOverride: () => void;
}) {
  const rateCell = (
    <td className={`px-3 py-2 text-right ${grp.isOverridden ? "bg-yellow-100 dark:bg-yellow-900/20" : ""}`}>
      <div className="flex items-center justify-end gap-1">
        {grp.isOverridden && (
          <span
            className="text-xs text-amber-600 dark:text-amber-400 font-semibold cursor-help"
            title={`Original: NRS ${NRS(grp.originalRate ?? 0)}`}
          >
            [!]
          </span>
        )}
        {grp.pendingOverride && (
          <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-1 rounded" title="Pending override review">
            pending
          </span>
        )}
        <span>{NRS(grp.rate)}</span>
        {grp.rateItemId && (
          <button
            onClick={onProposeOverride}
            className="ml-1 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-xs"
            aria-label={isAdmin ? "Override rate" : "Propose override"}
          >
            [edit]
          </button>
        )}
      </div>
    </td>
  );

  return (
    <>
      {/* Category separator if it's the first in its category */}
      {/* Group header row */}
      <tr
        className="bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer border-b border-blue-100 dark:border-blue-800"
        onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        aria-label={`${grp.name} — click to ${expanded ? "collapse" : "expand"}`}
      >
        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">{sno}</td>
        <td className="px-3 py-2">
          <div className="flex items-start gap-1">
            <span className="text-gray-500 dark:text-gray-400 mt-0.5 text-xs" aria-hidden>{expanded ? "v" : ">"}</span>
            <div>
              <div className="font-semibold text-gray-800 dark:text-gray-100">{grp.name}</div>
              {grp.preamble && (
                <div className="text-xs text-gray-500 dark:text-gray-400 italic mt-0.5">{grp.preamble}</div>
              )}
              {grp.rateCode && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Code: {grp.rateCode}</div>
              )}
              {grp.conversionFactor !== 1 && grp.totalQuantity > 0 && (
                <div
                  className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5 font-normal"
                  title={`Unit conversion: ${grp.originalQuantity.toFixed(3)} ${grp.originalUnit} × ${grp.conversionFactor.toFixed(6)} = ${grp.totalQuantity.toFixed(3)} ${grp.unit}`}
                  aria-label={`Unit converted from ${grp.originalUnit} to ${grp.unit}`}
                >
                  {qty(grp.originalQuantity)} {grp.originalUnit} → {qty(grp.totalQuantity)} {grp.unit}
                  <span className="ml-1 opacity-70">(×{grp.conversionFactor.toFixed(6)})</span>
                </div>
              )}
            </div>
          </div>
        </td>
        <td colSpan={5} />
        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">{grp.unit}</td>
        {rateCell}
        <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-100">
          {NRS(grp.amount)}
        </td>
      </tr>

      {/* Item sub-rows (expanded) */}
      {expanded &&
        grp.items.map((item) => (
          <tr key={item.id} className="text-xs text-gray-600 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
            <td className="px-3 py-1" />
            <td className="px-3 py-1 pl-10 text-gray-700 dark:text-gray-300">{item.label}</td>
            <td className="px-3 py-1 text-right text-gray-500">
              {item.multiplier !== 1 ? item.multiplier : ""}
            </td>
            <td className="px-3 py-1 text-right">
              {item.length != null ? qty(item.length) : ""}
            </td>
            <td className="px-3 py-1 text-right">
              {item.breadth != null ? qty(item.breadth) : ""}
            </td>
            <td className="px-3 py-1 text-right">
              {item.height != null ? qty(item.height) : ""}
            </td>
            <td className="px-3 py-1 text-right font-medium">{qty(item.quantity, grp.type === "COUNT")}</td>
            <td className="px-3 py-1 text-center">{item.unit}</td>
            <td colSpan={2} className="px-3 py-1 text-gray-600 dark:text-gray-400 text-xs">
              {item.siteLocation && (
                <span className="inline-flex items-center gap-1 mr-2">
                  <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1 rounded text-[10px] font-medium">loc</span>
                  {item.siteLocation}
                </span>
              )}
              {item.notes && (
                <span className="inline-flex items-center gap-1">
                  <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1 rounded text-[10px] font-medium">note</span>
                  {item.notes}
                </span>
              )}
            </td>
          </tr>
        ))}

      {/* Group total sub-row when expanded */}
      {expanded && grp.items.length > 0 && (
        <tr className="bg-blue-50 dark:bg-blue-900/20 text-xs border-b border-blue-200 dark:border-blue-800">
          <td colSpan={6} />
          <td className="px-3 py-1 text-right font-semibold text-blue-800 dark:text-blue-300">
            <div>{qty(grp.totalQuantity, grp.type === "COUNT")}</div>
            {grp.conversionFactor !== 1 && grp.totalQuantity > 0 && (
              <div
                className="text-[10px] text-amber-700 dark:text-amber-300 font-normal whitespace-nowrap"
                title={`Original measurement before unit conversion: ${grp.originalQuantity.toFixed(3)} ${grp.originalUnit}`}
              >
                {qty(grp.originalQuantity)} {grp.originalUnit}
              </div>
            )}
          </td>
          <td className="px-3 py-1 text-center text-blue-700 dark:text-blue-400">{grp.unit}</td>
          <td className="px-3 py-1 text-right text-blue-700 dark:text-blue-400">{NRS(grp.rate)}</td>
          <td className="px-3 py-1 text-right font-bold text-blue-900 dark:text-blue-200">{NRS(grp.amount)}</td>
        </tr>
      )}
    </>
  );
}

// ─── Financial row helper ─────────────────────────────────────────────────────

function FinRow({
  label,
  value,
  bold = false,
  highlight = false,
  deduction = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
  highlight?: boolean;
  deduction?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-blue-900 text-white" : "bg-gray-50 dark:bg-gray-800"}>
      <td
        colSpan={9}
        className={`px-3 py-2 text-right ${bold ? "font-bold" : ""} text-sm ${highlight ? "" : "text-gray-700 dark:text-gray-300"}`}
      >
        {label}
      </td>
      <td className={`px-3 py-2 text-right ${bold ? "font-bold" : ""} text-sm ${deduction ? "text-orange-600 dark:text-orange-400" : highlight ? "" : "text-gray-800 dark:text-gray-100"}`}>
        {deduction ? `(${NRS(value)})` : `NRS ${NRS(value)}`}
      </td>
    </tr>
  );
}
