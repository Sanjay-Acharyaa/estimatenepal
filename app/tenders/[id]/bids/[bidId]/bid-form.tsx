"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

interface LineItem {
  id: number;
  bidder_quantity: string | null;
  bidder_rate_npr: string;
  amount_npr: string;
  quantity_justification: string | null;
}

interface BidItem {
  boq_item_id: number;
  description: string;
  unit: string;
  client_quantity: string | null;
  line_item: LineItem | null;
}

interface Chapter {
  id: number;
  title: string;
  sort_order: number;
  items: BidItem[];
}

interface BidData {
  id: number;
  tender_id: number;
  status: string;
  version: number;
  contingency_percentage: string | null;
  notes_to_client: string | null;
  submitted_at: string | null;
  withdrawn_at?: string | null;
  withdrawal_count?: number;
  max_withdrawals?: number;
  quantity_visibility: string;
  vat_percentage: number;
  tender_title: string;
  tender_reference: string;
  is_editable?: boolean;
  deadline_passed?: boolean;
  bid_deadline?: string | null;
  chapters: Chapter[];
}

interface ItemState {
  rate: string;
  qty: string;
  justification: string;
}

type ItemStates = Record<number, ItemState>;

function initItemStates(chapters: Chapter[]): ItemStates {
  const states: ItemStates = {};
  for (const ch of chapters) {
    for (const item of ch.items) {
      const li = item.line_item;
      states[item.boq_item_id] = {
        rate: li ? String(li.bidder_rate_npr) : "",
        qty: li?.bidder_quantity ? String(li.bidder_quantity) : "",
        justification: li?.quantity_justification ?? "",
      };
    }
  }
  return states;
}

function fmtNPR(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcLiveTotals(states: ItemStates, chapters: Chapter[], contingencyPct: number, vatPct: number) {
  let grandTotal = 0;
  for (const ch of chapters) {
    for (const item of ch.items) {
      const s = states[item.boq_item_id];
      if (!s) continue;
      const rate = parseFloat(s.rate);
      if (!rate || rate <= 0) continue;
      const clientQty = item.client_quantity ? parseFloat(item.client_quantity) : null;
      const bidderQty = s.qty ? parseFloat(s.qty) : null;
      const qty = bidderQty ?? clientQty ?? 0;
      grandTotal += qty * rate;
    }
  }
  const contingencyAmt = (grandTotal * contingencyPct) / 100;
  const vatAmt = ((grandTotal + contingencyAmt) * vatPct) / 100;
  const totalWithVat = grandTotal + contingencyAmt + vatAmt;
  return { grandTotal, contingencyAmt, vatAmt, totalWithVat };
}

const STATUS_COLOURS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  SHORTLISTED: "bg-yellow-100 text-yellow-800",
  AWARDED: "bg-green-100 text-green-700",
  NOT_AWARDED: "bg-red-100 text-red-700",
  REJECTED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-orange-100 text-orange-700",
};

function ItemRow({
  item,
  state,
  isHidden,
  isEditable,
  onChangeRate,
  onChangeQty,
  onBlurRate,
}: {
  item: BidItem;
  state: ItemState;
  isHidden: boolean;
  isEditable: boolean;
  onChangeRate: (v: string) => void;
  onChangeQty: (v: string) => void;
  onBlurRate: () => void;
}) {
  const clientQty = item.client_quantity ? parseFloat(item.client_quantity) : null;
  const rate = parseFloat(state.rate) || 0;
  const bidderQty = state.qty ? parseFloat(state.qty) : null;
  const effectiveQty = bidderQty ?? clientQty ?? 0;
  const amount = rate > 0 && effectiveQty > 0 ? rate * effectiveQty : 0;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-2 px-3 text-sm text-gray-800 max-w-xs">{item.description}</td>
      <td className="py-2 px-3 text-sm text-center text-gray-500">{item.unit}</td>
      <td className="py-2 px-3 text-right align-top">
        <input
          type="number"
          min="0"
          step="0.01"
          value={state.qty}
          onChange={(e) => onChangeQty(e.target.value)}
          disabled={!isEditable}
          placeholder={isHidden ? "Required" : clientQty !== null ? clientQty.toFixed(2) : ""}
          inputMode="decimal"
          className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm placeholder:text-gray-300 disabled:bg-transparent disabled:border-transparent disabled:text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </td>
      <td className="py-2 px-3 text-right align-top">
        <input
          type="number"
          min="0"
          step="0.01"
          value={state.rate}
          onChange={(e) => onChangeRate(e.target.value)}
          onBlur={onBlurRate}
          disabled={!isEditable}
          placeholder="0.00"
          inputMode="decimal"
          className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm placeholder:text-gray-300 disabled:bg-transparent disabled:border-transparent disabled:text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </td>
      <td className="py-2 px-3 text-right text-sm tabular-nums text-gray-700">
        {amount > 0 ? fmtNPR(amount) : "—"}
      </td>
    </tr>
  );
}

export default function BidForm({ tenderId, bidId, bid }: { tenderId: number; bidId: number; bid: BidData }) {
  const router = useRouter();
  const isHidden = bid.quantity_visibility === "HIDDEN";

  const [itemStates, setItemStates] = useState<ItemStates>(() => initItemStates(bid.chapters));
  const [contingencyPct, setContingencyPct] = useState(String(Number(bid.contingency_percentage ?? 0)));
  const [notes, setNotes] = useState(bid.notes_to_client ?? "");
  const [bidStatus, setBidStatus] = useState(bid.status);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawConfirm, setWithdrawConfirm] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const isDraft = bidStatus === "DRAFT";
  const isEditable = isDraft || (bidStatus === "SUBMITTED" && (bid.is_editable ?? false));

  const itemStatesRef = useRef(itemStates);
  const notesRef = useRef(notes);
  useEffect(() => { itemStatesRef.current = itemStates; }, [itemStates]);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  const liveTotals = useMemo(
    () => calcLiveTotals(itemStates, bid.chapters, parseFloat(contingencyPct) || 0, bid.vat_percentage),
    [itemStates, bid.chapters, contingencyPct, bid.vat_percentage]
  );

  const save = useCallback(async (): Promise<boolean> => {
    const items = Object.entries(itemStatesRef.current)
      .filter(([, s]) => parseFloat(s.rate) > 0)
      .map(([id, s]) => {
        const qty = parseFloat(s.qty);
        return {
          boq_item_id: parseInt(id, 10),
          bidder_rate_npr: parseFloat(s.rate),
          ...(s.qty && !isNaN(qty) && qty > 0 ? { bidder_quantity: qty } : {}),
          ...(s.justification ? { quantity_justification: s.justification } : {}),
        };
      });

    if (items.length === 0) return true;

    setSaving(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bids/${bidId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      if (res.ok) { setSavedAt(new Date()); return true; }
      if (res.status === 401) { router.push("/login"); return false; }
      return false;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, [tenderId, bidId, router]);

  useEffect(() => {
    if (!isEditable) return;
    const timer = setInterval(() => { save(); }, 30_000);
    return () => clearInterval(timer);
  }, [isEditable, save]);

  async function handleContingencyBlur() {
    const pct = parseFloat(contingencyPct);
    if (isNaN(pct) || pct < 0 || pct > 100 || !isEditable) return;
    const res = await fetch(`/api/tenders/${tenderId}/bids/${bidId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contingency_percentage: pct }),
    });
    if (res.status === 401) router.push("/login");
  }

  async function handleNotesBlur() {
    if (!isEditable) return;
    const res = await fetch(`/api/tenders/${tenderId}/bids/${bidId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes_to_client: notesRef.current }),
    });
    if (res.status === 401) router.push("/login");
  }

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    const saved = await save();
    if (!saved) {
      setSubmitError("Save failed before submission. Please try again.");
      setSubmitting(false);
      return;
    }
    const res = await fetch(`/api/tenders/${tenderId}/bids/${bidId}/submit`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { router.push("/login"); return; }
      const details: string[] = data.error?.details ?? [];
      setSubmitError(
        details.length > 0
          ? `Incomplete bid:\n${details.slice(0, 5).join("\n")}${details.length > 5 ? `\n…and ${details.length - 5} more` : ""}`
          : (data.error?.message ?? "Submission failed.")
      );
      setSubmitting(false);
      return;
    }
    setBidStatus("SUBMITTED");
    setSubmitting(false);
  }

  async function handleWithdraw() {
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bids/${bidId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: withdrawReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        setWithdrawError(data.error?.message ?? "Withdrawal failed.");
        return;
      }
      setBidStatus("WITHDRAWN");
      setWithdrawConfirm(false);
    } catch {
      setWithdrawError("Network error. Please try again.");
    } finally {
      setWithdrawing(false);
    }
  }

  const statusColor = STATUS_COLOURS[bidStatus] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4 sticky top-0 z-10">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 font-mono">{bid.tender_reference}</p>
            <h1 className="text-sm font-semibold text-gray-900 truncate max-w-md">{bid.tender_title}</h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>{bidStatus}</span>
            {saving && <span className="text-xs text-gray-400">Saving…</span>}
            {!saving && savedAt && (
              <span className="text-xs text-gray-400">
                Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {isEditable && (
              <button
                onClick={() => save()}
                disabled={saving}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Save
              </button>
            )}
            {isEditable && (
              <button
                onClick={handleSubmit}
                disabled={submitting || saving}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : bidStatus === "SUBMITTED" ? "Re-submit" : "Submit bid"}
              </button>
            )}
            {bidStatus === "SUBMITTED" && !bid.deadline_passed && (
              <button
                onClick={() => setWithdrawConfirm(true)}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Withdraw
              </button>
            )}
          </div>
        </div>
        {submitError && (
          <div className="mx-auto max-w-5xl mt-2">
            <p className="text-xs text-red-600 whitespace-pre-line">{submitError}</p>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">
        {/* Totals panel */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Grand total</p>
            <p className="text-lg font-semibold text-gray-900 tabular-nums">NPR {fmtNPR(liveTotals.grandTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Contingency ({contingencyPct}%)</p>
            <p className="text-sm font-medium text-gray-700 tabular-nums">NPR {fmtNPR(liveTotals.contingencyAmt)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">VAT ({bid.vat_percentage}%)</p>
            <p className="text-sm font-medium text-gray-700 tabular-nums">NPR {fmtNPR(liveTotals.vatAmt)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Total with VAT</p>
            <p className="text-lg font-semibold text-blue-700 tabular-nums">NPR {fmtNPR(liveTotals.totalWithVat)}</p>
          </div>
        </div>

        {/* Contingency + notes */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 grid sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contingency %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={contingencyPct}
              onChange={(e) => setContingencyPct(e.target.value)}
              onBlur={handleContingencyBlur}
              disabled={!isEditable}
              className="w-32 rounded border border-gray-300 px-3 py-1.5 text-sm text-right disabled:bg-gray-50 disabled:text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes to client (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              disabled={!isEditable}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Any notes or qualifications for the client…"
            />
          </div>
        </div>

        {/* BOQ chapters */}
        {bid.chapters.map((ch) => (
          <div key={ch.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{ch.title}</h2>
            </div>
            {ch.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-white">
                      <th className="py-2 px-3 text-left text-xs font-medium text-gray-500">Description</th>
                      <th className="py-2 px-3 text-center text-xs font-medium text-gray-500">Unit</th>
                      <th className="py-2 px-3 text-right text-xs font-medium text-gray-500">
                        {isHidden ? "Your qty *" : "Qty"}
                      </th>
                      <th className="py-2 px-3 text-right text-xs font-medium text-gray-500">Rate (NPR) *</th>
                      <th className="py-2 px-3 text-right text-xs font-medium text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ch.items.map((item) => (
                      <ItemRow
                        key={item.boq_item_id}
                        item={item}
                        state={itemStates[item.boq_item_id] ?? { rate: "", qty: "", justification: "" }}
                        isHidden={isHidden}
                        isEditable={isEditable}
                        onChangeRate={(v) => setItemStates((p) => ({ ...p, [item.boq_item_id]: { ...p[item.boq_item_id], rate: v } }))}
                        onChangeQty={(v) => setItemStates((p) => ({ ...p, [item.boq_item_id]: { ...p[item.boq_item_id], qty: v } }))}
                        onBlurRate={() => { /* autosave handles persistence */ }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-4 text-xs text-gray-400">No items in this chapter.</p>
            )}
          </div>
        ))}

        {isHidden && (
          <p className="text-xs text-gray-400">* Quantities are hidden — you must supply your own quantities for each item.</p>
        )}
      </div>

      {/* Withdraw modal */}
      {withdrawConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Withdraw bid?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Withdrawing is permanent. You may not be able to re-submit depending on platform settings.
            </p>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason (optional)</label>
            <textarea
              rows={2}
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm mb-4 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Reason for withdrawal…"
            />
            {withdrawError && <p className="text-xs text-red-600 mb-3">{withdrawError}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {withdrawing ? "Withdrawing…" : "Yes, withdraw"}
              </button>
              <button
                onClick={() => { setWithdrawConfirm(false); setWithdrawError(null); }}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
