'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface BidOption {
  id: number
  bidder_user_id: number
  bidder_name: string
  grand_total_npr: number | null
  total_with_vat_npr: number | null
}

interface NegotiationItem {
  id: number
  bidder_user_id: number
  bidder_name: string
  status: string
  deadline: string | null
  original_grand_total_npr: string
  current_proposed_total_npr: string
  proposed_discount_percentage: number
  initiated_at: string
  closed_at: string | null
}

interface Props {
  tenderId: number
  tenderStatus: string
  bidDeadline: string
  shortlistedBids: BidOption[]
  negotiations: NegotiationItem[]
}

function fmtNPR(v: number | string | null): string {
  if (v === null || v === undefined) return '—'
  return `NPR ${Number(v).toLocaleString('en-NP', { maximumFractionDigits: 0 })}`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function NegotiationList({ tenderId, negotiations }: { tenderId: number; negotiations: NegotiationItem[] }) {
  const active = negotiations.filter((n) => n.status === 'ACTIVE')
  const closed = negotiations.filter((n) => n.status !== 'ACTIVE')
  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Active</p>
          <div className="space-y-2">
            {active.map((n) => (
              <Link
                key={n.id}
                href={`/client/tenders/${tenderId}/negotiate/${n.id}`}
                className="block rounded-xl border border-green-200 bg-white p-4 hover:border-green-400 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{n.bidder_name}</p>
                  <span className="text-xs rounded-full bg-green-100 text-green-700 px-2 py-0.5 font-medium">Active</span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-gray-500">
                  <span>Original: {fmtNPR(n.original_grand_total_npr)}</span>
                  <span>Proposed: {fmtNPR(n.current_proposed_total_npr)}</span>
                  {n.proposed_discount_percentage > 0 && (
                    <span className="text-green-700">{n.proposed_discount_percentage}% off</span>
                  )}
                </div>
                {n.deadline && (
                  <p className="mt-1 text-xs text-gray-400">Deadline: {fmtDate(n.deadline)}</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
      {closed.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Closed</p>
          <div className="space-y-2">
            {closed.map((n) => (
              <Link
                key={n.id}
                href={`/client/tenders/${tenderId}/negotiate/${n.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-400 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{n.bidder_name}</p>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                    n.status === 'CLOSED_AGREEMENT'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {n.status === 'CLOSED_AGREEMENT' ? 'Agreed' : 'Closed'}
                  </span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-gray-500">
                  <span>Original: {fmtNPR(n.original_grand_total_npr)}</span>
                  <span>Proposed: {fmtNPR(n.current_proposed_total_npr)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InitiationForm({
  tenderId,
  shortlistedBids,
  existingBidderIds,
  onCreated,
}: {
  tenderId: number
  shortlistedBids: BidOption[]
  existingBidderIds: Set<number>
  onCreated: () => void
}) {
  const router = useRouter()
  const available = shortlistedBids.filter((b) => !existingBidderIds.has(b.bidder_user_id))
  const [selected, setSelected] = useState<number[]>([])
  const [deadline, setDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(userId: number) {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (selected.length === 0) { setError('Select at least one bidder.'); return }
    if (!deadline) { setError('Set a deadline.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/tenders/${tenderId}/negotiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidder_user_ids: selected, deadline: new Date(deadline).toISOString() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? 'Failed to open negotiations.'); return }
      router.refresh()
      onCreated()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (available.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        All shortlisted bidders already have an active negotiation thread.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Select bidders</p>
        {available.map((b) => (
          <label key={b.bidder_user_id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 cursor-pointer hover:border-blue-300">
            <input
              type="checkbox"
              checked={selected.includes(b.bidder_user_id)}
              onChange={() => toggle(b.bidder_user_id)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-900 flex-1">{b.bidder_name}</span>
            <span className="text-xs text-gray-500">
              {fmtNPR(b.total_with_vat_npr ?? b.grand_total_npr)}
            </span>
          </label>
        ))}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Negotiation deadline</label>
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Opening…' : 'Open negotiation threads'}
      </button>
    </form>
  )
}

export default function NegotiateHub({
  tenderId,
  tenderStatus,
  bidDeadline,
  shortlistedBids,
  negotiations,
}: Props) {
  const [showForm, setShowForm] = useState(false)
  const deadlinePassed = new Date(bidDeadline) <= new Date()
  const existingBidderIds = new Set(negotiations.map((n) => n.bidder_user_id))

  if (tenderStatus === 'PUBLISHED' && !deadlinePassed) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
        <p className="text-sm font-semibold text-gray-600">Bidding is still open</p>
        <p className="text-xs text-gray-400 mt-1">Negotiation becomes available after the bid deadline passes and bids are closed.</p>
      </div>
    )
  }

  if (tenderStatus === 'AWARDED') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4">
          <p className="text-sm font-semibold text-green-800">This tender has been awarded.</p>
        </div>
        <NegotiationList tenderId={tenderId} negotiations={negotiations} />
      </div>
    )
  }

  if (tenderStatus === 'UNDER_REVIEW') {
    if (shortlistedBids.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-gray-600">No shortlisted bids</p>
          <p className="text-xs text-gray-400 mt-1">
            Shortlist at least one bid from the{' '}
            <Link href={`/client/tenders/${tenderId}/bids`} className="text-blue-600 hover:underline">Bids page</Link>{' '}
            before opening negotiations.
          </p>
        </div>
      )
    }
    return (
      <div className="max-w-xl">
        <p className="text-sm text-gray-600 mb-4">
          Open negotiation threads with one or more shortlisted bidders. Each thread allows you to discuss pricing and reach an agreement.
        </p>
        <InitiationForm
          tenderId={tenderId}
          shortlistedBids={shortlistedBids}
          existingBidderIds={existingBidderIds}
          onCreated={() => setShowForm(false)}
        />
      </div>
    )
  }

  // NEGOTIATION status
  return (
    <div className="space-y-6">
      <NegotiationList tenderId={tenderId} negotiations={negotiations} />

      {shortlistedBids.some((b) => !existingBidderIds.has(b.bidder_user_id)) && (
        <div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showForm ? '— Hide form' : '+ Add more bidders to negotiation'}
          </button>
          {showForm && (
            <div className="mt-4 max-w-xl">
              <InitiationForm
                tenderId={tenderId}
                shortlistedBids={shortlistedBids}
                existingBidderIds={existingBidderIds}
                onCreated={() => setShowForm(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
