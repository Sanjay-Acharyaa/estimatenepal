"use client";

import { useState, useEffect } from "react";
import type { BOQDocument, BOQGroup } from "@/lib/boq";
import { OverrideDialog } from "./OverrideDialog";

const NRS = (n: number) =>
  n.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

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
      <div className="text-center py-16 text-gray-600 text-sm">
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
        <div className="text-center py-12 text-gray-600 text-sm">
          No takeoff items yet. Add items on the drawing canvas first.
        </div>
      )}

      {hasAnyItems && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-blue-900 text-white">
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
            {boq.project.vatEnabled && (
              <FinRow label={`VAT (${boq.project.vatRate}%)`} value={boq.vatAmount} />
            )}
            {boq.project.tdsEnabled && (
              <FinRow label={`TDS (${boq.project.tdsRate}%)`} value={-boq.tdsAmount} />
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
      <tr className="bg-blue-600 text-white">
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
      <tr className="bg-blue-50 border-t-2 border-blue-200">
        <td colSpan={9} className="px-3 py-2 text-right font-semibold text-blue-800 text-sm">
          {disc.name} Sub-Total
        </td>
        <td className="px-3 py-2 text-right font-bold text-blue-900 text-sm">
          NRS {NRS(disc.subtotal)}
        </td>
      </tr>
      <tr><td colSpan={10} className="py-1 bg-gray-50 border-b border-gray-200" /></tr>
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
    <td className={`px-3 py-2 text-right ${grp.isOverridden ? "bg-yellow-100" : ""}`}>
      <div className="flex items-center justify-end gap-1">
        {grp.isOverridden && (
          <span
            className="text-xs text-amber-600 cursor-help"
            title={`Original: NRS ${NRS(grp.originalRate ?? 0)}`}
          >
            ⚠
          </span>
        )}
        {grp.pendingOverride && (
          <span className="text-xs bg-orange-100 text-orange-700 px-1 rounded" title="Pending override review">
            pending
          </span>
        )}
        <span>{NRS(grp.rate)}</span>
        {grp.rateItemId && !isAdmin && (
          <button
            onClick={onProposeOverride}
            className="ml-1 text-gray-600 hover:text-blue-600 text-xs"
            aria-label="Propose override"
          >
            ✎
          </button>
        )}
        {grp.rateItemId && isAdmin && (
          <button
            onClick={onProposeOverride}
            className="ml-1 text-gray-600 hover:text-blue-600 text-xs"
            aria-label="Override rate"
          >
            ✎
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
        className="bg-blue-50 hover:bg-blue-100 cursor-pointer border-b border-blue-100"
        onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        aria-label={`${grp.name} — click to ${expanded ? "collapse" : "expand"}`}
      >
        <td className="px-3 py-2 text-gray-500 text-xs">{sno}</td>
        <td className="px-3 py-2">
          <div className="flex items-start gap-1">
            <span className="text-gray-600 mt-0.5 text-xs" aria-hidden>{expanded ? "▼" : "▶"}</span>
            <div>
              <div className="font-semibold text-gray-800">{grp.name}</div>
              {grp.preamble && (
                <div className="text-xs text-gray-500 italic mt-0.5">{grp.preamble}</div>
              )}
              {grp.rateCode && (
                <div className="text-xs text-gray-600 mt-0.5">Code: {grp.rateCode}</div>
              )}
            </div>
          </div>
        </td>
        <td colSpan={5} />
        <td className="px-3 py-2 text-center text-gray-600">{grp.unit}</td>
        {rateCell}
        <td className="px-3 py-2 text-right font-semibold text-gray-800">
          {NRS(grp.amount)}
        </td>
      </tr>

      {/* Item sub-rows (expanded) */}
      {expanded &&
        grp.items.map((item) => (
          <tr key={item.id} className="text-xs text-gray-600 border-b border-gray-100">
            <td className="px-3 py-1" />
            <td className="px-3 py-1 pl-10 text-gray-700">{item.label}</td>
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
            <td className="px-3 py-1 text-right font-medium">{qty(item.quantity)}</td>
            <td className="px-3 py-1 text-center">{item.unit}</td>
            <td colSpan={2} className="px-3 py-1 text-gray-600 text-xs">
              {item.siteLocation && <span className="mr-2">📍 {item.siteLocation}</span>}
              {item.notes && <span>📝 {item.notes}</span>}
            </td>
          </tr>
        ))}

      {/* Group total sub-row when expanded */}
      {expanded && grp.items.length > 0 && (
        <tr className="bg-blue-50 text-xs border-b border-blue-200">
          <td colSpan={6} />
          <td className="px-3 py-1 text-right font-semibold text-blue-800">
            {qty(grp.totalQuantity)}
          </td>
          <td className="px-3 py-1 text-center text-blue-700">{grp.unit}</td>
          <td className="px-3 py-1 text-right text-blue-700">{NRS(grp.rate)}</td>
          <td className="px-3 py-1 text-right font-bold text-blue-900">{NRS(grp.amount)}</td>
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
}: {
  label: string;
  value: number;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-blue-900 text-white" : "bg-gray-50"}>
      <td
        colSpan={9}
        className={`px-3 py-2 text-right ${bold ? "font-bold" : ""} text-sm`}
      >
        {label}
      </td>
      <td className={`px-3 py-2 text-right ${bold ? "font-bold" : ""} text-sm`}>
        NRS {NRS(value)}
      </td>
    </tr>
  );
}
