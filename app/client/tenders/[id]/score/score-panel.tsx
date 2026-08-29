'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SummaryBid {
  bid_id: number;
  bidder_name: string;
  grand_total_npr: string | number | null;
  system_score: number | null;
  price_score: number | null;
  quantity_score: number | null;
  outlier_flagged: boolean;
  status: string;
  shortlisted: boolean;
  manual_rank: number | null;
  client_note: string | null;
}

interface BidHeader { bid_id: number; label: string; status: string; }

interface DetailItem {
  item_id: number;
  chapter_id: number;
  item_code: string | null;
  description: string;
  unit: string;
  client_quantity: number | null;
  sort_order: number;
  bids: Record<number, { quantity: number | null; rate: number; amount: number; item_notes: string | null; outlier_cell: boolean; is_lowest: boolean; is_highest: boolean }>;
}

interface ChapterRow {
  chapter_id: number;
  title: string;
  sort_order: number;
  level: number;
  parent_chapter_id: number | null;
  subtotals: Record<number, number>;
}

interface Props {
  tenderId: number;
  initialSummary: SummaryBid[];
}

function fmtNPR(v: string | number | null): string {
  if (v === null || v === undefined) return '—';
  return `NPR ${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtScore(v: number | null): string {
  if (v === null) return '—';
  return v.toFixed(1);
}

function scoreColour(v: number | null): string {
  if (v === null) return 'bg-gray-100 text-gray-400';
  if (v >= 70) return 'bg-green-100 text-green-800';
  if (v >= 40) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-700';
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted', SHORTLISTED: 'Shortlisted', REJECTED: 'Rejected',
  AWARDED: 'Awarded', NOT_AWARDED: 'Not awarded',
};

const STATUS_COLOURS: Record<string, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-700', SHORTLISTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-gray-100 text-gray-500', AWARDED: 'bg-purple-100 text-purple-700',
  NOT_AWARDED: 'bg-gray-100 text-gray-500',
};

function sortedSummary(summary: SummaryBid[]): SummaryBid[] {
  return [...summary].sort((a, b) => {
    if (a.system_score === null && b.system_score === null) return 0;
    if (a.system_score === null) return 1;
    if (b.system_score === null) return -1;
    return b.system_score - a.system_score;
  });
}

type Tab = 'summary' | 'detail' | 'chapter';

export default function ScorePanel({ tenderId, initialSummary }: Props) {
  const router = useRouter();
  const [summary, setSummary] = useState<SummaryBid[]>(initialSummary);
  const [tab, setTab] = useState<Tab>('summary');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [detailBids, setDetailBids] = useState<BidHeader[] | null>(null);
  const [detailItems, setDetailItems] = useState<DetailItem[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [chapterBids, setChapterBids] = useState<BidHeader[] | null>(null);
  const [chapterRows, setChapterRows] = useState<ChapterRow[] | null>(null);
  const [grandTotals, setGrandTotals] = useState<Record<number, number> | null>(null);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [collapsedChapters, setCollapsedChapters] = useState<Set<number>>(new Set());

  const needsScoring = summary.length === 0 || summary.some((b) => b.system_score === null);
  const ranked = sortedSummary(summary);

  async function refreshSummary() {
    const res = await fetch(`/api/tenders/${tenderId}/comparison?view=summary`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary ?? []);
    }
  }

  async function runScoring() {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/score`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push('/login'); return; }
        setRunError(data.error?.message ?? 'Scoring failed.');
        return;
      }
      await refreshSummary();
    } catch {
      setRunError('Network error. Please try again.');
    } finally {
      setRunning(false);
    }
  }

  async function loadDetail() {
    if (detailBids !== null) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/comparison?view=detail`, { cache: 'no-store' });
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) { const d = await res.json(); setDetailError(d.error?.message ?? 'Failed.'); return; }
      const data = await res.json();
      setDetailBids(data.bids ?? []);
      setDetailItems(data.detail ?? []);
    } catch { setDetailError('Network error.'); }
    finally { setDetailLoading(false); }
  }

  async function loadChapter() {
    if (chapterBids !== null) return;
    setChapterLoading(true);
    setChapterError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/comparison?view=chapter`, { cache: 'no-store' });
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) { const d = await res.json(); setChapterError(d.error?.message ?? 'Failed.'); return; }
      const data = await res.json();
      setChapterBids(data.bids ?? []);
      setChapterRows(data.chapter_breakdown ?? []);
      setGrandTotals(data.grand_totals ?? {});
    } catch { setChapterError('Network error.'); }
    finally { setChapterLoading(false); }
  }

  function switchTab(next: Tab) {
    setTab(next);
    if (next === 'detail') loadDetail();
    if (next === 'chapter') loadChapter();
  }

  async function shortlist(bidId: number) {
    setActionBusy(bidId); setActionError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bids/${bidId}/shortlist`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { if (res.status === 401) { router.push('/login'); return; } setActionError(data.error?.message ?? 'Shortlist failed.'); return; }
      setSummary((prev) => prev.map((b) => b.bid_id === bidId ? { ...b, status: 'SHORTLISTED', shortlisted: true } : b));
    } catch { setActionError('Network error.'); }
    finally { setActionBusy(null); }
  }

  async function reject(bidId: number) {
    if (!confirm('Reject this bid?')) return;
    setActionBusy(bidId); setActionError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bids/${bidId}/reject`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { if (res.status === 401) { router.push('/login'); return; } setActionError(data.error?.message ?? 'Reject failed.'); return; }
      setSummary((prev) => prev.map((b) => b.bid_id === bidId ? { ...b, status: 'REJECTED', shortlisted: false } : b));
    } catch { setActionError('Network error.'); }
    finally { setActionBusy(null); }
  }

  function openNote(bid: SummaryBid) { setActiveNoteId(bid.bid_id); setNoteDraft(bid.client_note ?? ''); }

  async function saveNote(bidId: number) {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/bids/${bidId}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteDraft.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { if (res.status === 401) { router.push('/login'); return; } setActionError(data.error?.message ?? 'Failed to save note.'); return; }
      setSummary((prev) => prev.map((b) => b.bid_id === bidId ? { ...b, client_note: data.bid?.client_note ?? null } : b));
      setActiveNoteId(null);
    } catch { setActionError('Network error.'); }
    finally { setSavingNote(false); }
  }

  function toggleChapter(chapterId: number) {
    setCollapsedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId); else next.add(chapterId);
      return next;
    });
  }

  if (summary.length === 0 && !needsScoring) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
        <p className="text-sm text-gray-400">No bids received for this tender.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {needsScoring && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-800">
              {summary.length === 0 ? 'No bids scored yet.' : 'Some bids have not been scored.'}
            </p>
            <p className="text-xs text-blue-600 mt-0.5">Run scoring to rank all submitted bids by price and quantity accuracy.</p>
            {runError && <p className="text-xs text-red-600 mt-1">{runError}</p>}
          </div>
          <button onClick={runScoring} disabled={running} className="shrink-0 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {running ? 'Running…' : 'Run scoring'}
          </button>
        </div>
      )}

      {actionError && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>}

      {ranked.length > 0 && (
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
          {(['summary', 'detail', 'chapter'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* ── Summary tab ──────────────────────────────────────────────────────── */}
      {tab === 'summary' && ranked.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium w-10">#</th>
                  <th className="px-4 py-3 text-left font-medium">Bidder</th>
                  <th className="px-4 py-3 text-right font-medium">Grand Total</th>
                  <th className="px-4 py-3 text-center font-medium w-24">Score</th>
                  <th className="px-4 py-3 text-center font-medium">Sub-scores</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ranked.map((bid, idx) => {
                  const rowBg = bid.status === 'SHORTLISTED' ? 'bg-green-50/40' : bid.status === 'REJECTED' ? 'bg-gray-50 opacity-60' : '';
                  return (
                    <tr key={bid.bid_id} className={rowBg}>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{bid.system_score !== null ? idx + 1 : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{bid.bidder_name}</div>
                        {bid.outlier_flagged && (
                          <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">⚠ Outlier rates</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{fmtNPR(bid.grand_total_npr)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-bold ${scoreColour(bid.system_score)}`}>
                          {fmtScore(bid.system_score)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-1 text-xs text-center">
                          {[{ label: 'Price', value: bid.price_score }, { label: 'Qty', value: bid.quantity_score }].map(({ label, value }) => (
                            <div key={label} className="rounded bg-gray-50 px-1 py-1">
                              <p className="text-gray-400 text-[10px] leading-none">{label}</p>
                              <p className="font-semibold text-gray-700 mt-0.5">{fmtScore(value)}</p>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[bid.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABELS[bid.status] ?? bid.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {activeNoteId === bid.bid_id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                className="w-36 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                                placeholder="Internal note…"
                                disabled={savingNote}
                              />
                              <button onClick={() => saveNote(bid.bid_id)} disabled={savingNote} className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">{savingNote ? '…' : 'Save'}</button>
                              <button onClick={() => setActiveNoteId(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                            </div>
                          ) : (
                            <button onClick={() => openNote(bid)} className="text-xs text-gray-400 hover:text-blue-600" title={bid.client_note ? `Note: ${bid.client_note}` : 'Add note'}>
                              {bid.client_note ? '📝' : '+ note'}
                            </button>
                          )}
                          {bid.status === 'SUBMITTED' && (
                            <button onClick={() => shortlist(bid.bid_id)} disabled={actionBusy === bid.bid_id} className="rounded-lg border border-green-300 bg-white px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50">
                              {actionBusy === bid.bid_id ? '…' : 'Shortlist'}
                            </button>
                          )}
                          {(bid.status === 'SUBMITTED' || bid.status === 'SHORTLISTED') && (
                            <button onClick={() => reject(bid.bid_id)} disabled={actionBusy === bid.bid_id} className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                              {actionBusy === bid.bid_id ? '…' : 'Reject'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Detail tab ───────────────────────────────────────────────────────── */}
      {tab === 'detail' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {detailLoading && <p className="px-5 py-8 text-center text-sm text-gray-400">Loading detail view…</p>}
          {detailError && <p className="px-5 py-4 text-sm text-red-600">{detailError}</p>}
          {!detailLoading && !detailError && detailBids && detailItems && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs divide-y divide-gray-200">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2.5 text-left font-medium w-20 whitespace-nowrap">Code</th>
                    <th className="sticky left-20 z-10 bg-gray-50 px-3 py-2.5 text-left font-medium min-w-48">Description</th>
                    <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">Unit</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Client Qty</th>
                    {detailBids.map((b) => (
                      <th key={b.bid_id} className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                        <div>{b.label}</div>
                        <div className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 font-medium ${STATUS_COLOURS[b.status] ?? 'bg-gray-100 text-gray-500'}`}>{STATUS_LABELS[b.status] ?? b.status}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailItems.map((item) => (
                    <tr key={item.item_id} className="hover:bg-gray-50/50">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 font-mono text-gray-400 whitespace-nowrap border-r border-gray-100">{item.item_code ?? '—'}</td>
                      <td className="sticky left-20 z-10 bg-white px-3 py-2 text-gray-800 border-r border-gray-100 max-w-xs"><span className="line-clamp-2">{item.description}</span></td>
                      <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">{item.unit}</td>
                      <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{item.client_quantity !== null ? fmtNum(item.client_quantity) : '—'}</td>
                      {detailBids.map((b) => {
                        const cell = item.bids[b.bid_id];
                        const cellBg = cell?.is_lowest ? 'bg-green-50 text-green-800' : cell?.is_highest ? 'bg-red-50 text-red-800' : cell?.outlier_cell ? 'border border-amber-300 text-amber-800' : 'text-gray-700';
                        return (
                          <td key={b.bid_id} className={`px-3 py-2 text-right whitespace-nowrap font-medium ${cellBg}`} title={cell?.item_notes ?? undefined}>
                            {cell?.rate ? fmtNum(cell.rate) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!detailLoading && !detailError && detailItems?.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No BOQ items found.</p>
          )}
        </div>
      )}
      {tab === 'detail' && !detailLoading && !detailError && detailBids && (
        <p className="text-xs text-gray-400">Green = lowest rate per item · Red = highest rate · Amber border = outlier rate</p>
      )}

      {/* ── Chapter tab ──────────────────────────────────────────────────────── */}
      {tab === 'chapter' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {chapterLoading && <p className="px-5 py-8 text-center text-sm text-gray-400">Loading chapter view…</p>}
          {chapterError && <p className="px-5 py-4 text-sm text-red-600">{chapterError}</p>}
          {!chapterLoading && !chapterError && chapterBids && chapterRows && grandTotals && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs divide-y divide-gray-200">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium min-w-56">Chapter</th>
                    {chapterBids.map((b) => (
                      <th key={b.bid_id} className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                        <div>{b.label}</div>
                        <div className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 font-medium ${STATUS_COLOURS[b.status] ?? 'bg-gray-100 text-gray-500'}`}>{STATUS_LABELS[b.status] ?? b.status}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {chapterRows
                    .filter((ch) => ch.parent_chapter_id === null || !collapsedChapters.has(ch.parent_chapter_id))
                    .map((ch) => {
                      const isTopLevel = ch.level === 0;
                      const hasChildren = chapterRows.some((c) => c.parent_chapter_id === ch.chapter_id);
                      const isCollapsed = collapsedChapters.has(ch.chapter_id);
                      return (
                        <tr key={ch.chapter_id} className={isTopLevel ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50/50'}>
                          <td className="px-4 py-2.5 text-gray-800">
                            <button
                              disabled={!hasChildren}
                              onClick={() => hasChildren && toggleChapter(ch.chapter_id)}
                              className={`flex items-center gap-1 text-left w-full ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
                              style={{ paddingLeft: `${ch.level * 16}px` }}
                            >
                              {hasChildren && <span className="text-gray-400 w-4 shrink-0">{isCollapsed ? '▶' : '▼'}</span>}
                              {!hasChildren && <span className="w-4 shrink-0" />}
                              <span className={isTopLevel ? 'text-gray-900' : 'text-gray-700'}>{ch.title}</span>
                            </button>
                          </td>
                          {chapterBids.map((b) => (
                            <td key={b.bid_id} className="px-4 py-2.5 text-right whitespace-nowrap text-gray-700">
                              {ch.subtotals[b.bid_id] ? `NPR ${Number(ch.subtotals[b.bid_id]).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  <tr className="bg-gray-900 text-white font-bold text-xs">
                    <td className="px-4 py-3">Grand Total</td>
                    {chapterBids.map((b) => (
                      <td key={b.bid_id} className="px-4 py-3 text-right whitespace-nowrap">
                        {grandTotals[b.bid_id] ? `NPR ${Number(grandTotals[b.bid_id]).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'summary' && !needsScoring && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-400">Scores are recalculated each time you run scoring, reflecting the latest bid data.</p>
          <button onClick={runScoring} disabled={running} className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50">
            {running ? 'Running…' : 'Re-run scoring'}
          </button>
        </div>
      )}
    </div>
  );
}
