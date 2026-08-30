'use client'

import { useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type LineItem = {
  chapter_title: string
  code: string
  description: string
  unit: string
  client_qty: string | null
  qty: string | null
  rate: string
  amount: string
}

type BidRecord = {
  id: number
  status: string
  submitted_at: string | null
  grand_total_npr: string | null
  bidder: { name: string; org: string | null }
  items: LineItem[]
}

const STATUS_COLOURS: Record<string, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-700',
  SHORTLISTED: 'bg-teal-100 text-teal-700',
  AWARDED: 'bg-green-100 text-green-700',
  NOT_AWARDED: 'bg-gray-100 text-gray-500',
}

function fmt(v: string | null | undefined): string {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  return isNaN(n) ? '-' : n.toLocaleString('en-NP', { maximumFractionDigits: 4 })
}

function fmtNPR(v: string | null | undefined): string {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  return isNaN(n) ? '-' : `NPR ${n.toLocaleString('en-NP', { maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-NP', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function groupByChapter(items: LineItem[]): { chapter: string; rows: LineItem[] }[] {
  const map: Map<string, LineItem[]> = new Map()
  for (const item of items) {
    const key = item.chapter_title
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return Array.from(map.entries()).map(([chapter, rows]) => ({ chapter, rows }))
}

export default function ConfidentialPage() {
  const params = useParams()
  const tenderId = params.id as string

  const [step, setStep] = useState<'form' | 'data'>('form')
  const [passphrase, setPassphrase] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [bids, setBids] = useState<BidRecord[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!passphrase) return
    setLoading(true)
    setError(null)

    const phrase = passphrase
    setPassphrase('')

    try {
      const res = await fetch(`/api/admin/tenders/${tenderId}/bids/confidential`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: phrase }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 404 && data?.error?.code === 'NOT_FOUND') {
          setDisabled(true)
          setError(data?.error?.message ?? 'No secondary passphrase configured.')
        } else {
          setError(data?.error?.message ?? 'Access denied.')
          setTimeout(() => inputRef.current?.focus(), 50)
        }
      } else {
        setBids(data.bids ?? [])
        setStep('data')
      }
    } catch {
      setError('Network error. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'form') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">
              Back to Admin
            </Link>
            <h1 className="mt-2 text-base font-semibold text-gray-900">Restricted Access</h1>
            <p className="mt-1 text-xs text-gray-500">Enter your secondary passphrase to view confidential bid data.</p>
          </div>

          <form onSubmit={handleSubmit} className="rounded-md border border-gray-200 bg-white p-6 space-y-4">
            <input
              ref={inputRef}
              type="password"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder="Secondary passphrase"
              disabled={loading || disabled}
              autoFocus
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            {disabled && (
              <p className="text-xs text-gray-500">
                Set a passphrase first in{' '}
                <Link href="/admin/security" className="text-blue-600 underline">Admin Security</Link>.
              </p>
            )}
            <button
              type="submit"
              disabled={loading || disabled || !passphrase}
              className="w-full rounded px-3 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div>
            <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">
              Back to Admin
            </Link>
            <h1 className="mt-0.5 text-sm font-semibold text-gray-900">
              Confidential Bid Data - {bids.length} submission{bids.length !== 1 ? 's' : ''}
            </h1>
          </div>
          <button
            onClick={() => { setBids([]); setStep('form') }}
            className="rounded px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        {bids.length === 0 && (
          <p className="text-sm text-gray-400">No submitted bids for this tender.</p>
        )}

        {bids.map(bid => {
          const chapters = groupByChapter(bid.items)
          return (
            <section key={bid.id} className="rounded-md border border-gray-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-semibold text-sm text-gray-900">{bid.bidder.name}</span>
                {bid.bidder.org && <span className="text-xs text-gray-500">{bid.bidder.org}</span>}
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[bid.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {bid.status}
                </span>
                <span className="text-xs text-gray-400 ml-auto">Submitted {fmtDate(bid.submitted_at)}</span>
                <span className="text-sm font-semibold text-gray-900">{fmtNPR(bid.grand_total_npr)}</span>
              </div>

              {chapters.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">No line items recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">Chapter / Code</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">Description</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">Unit</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wide">Client Qty</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wide">Bidder Qty</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wide">Rate (NPR)</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wide">Amount (NPR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {chapters.map(({ chapter, rows }) => (
                        <>
                          <tr key={`ch-${chapter}`} className="bg-gray-50">
                            <td colSpan={7} className="px-4 py-1.5 font-semibold text-gray-700 text-xs">{chapter}</td>
                          </tr>
                          {rows.map((item, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-mono text-gray-500">{item.code || '-'}</td>
                              <td className="px-4 py-2 text-gray-800 max-w-xs">{item.description}</td>
                              <td className="px-4 py-2 text-gray-600">{item.unit}</td>
                              <td className="px-4 py-2 text-right text-gray-500">{fmt(item.client_qty)}</td>
                              <td className="px-4 py-2 text-right text-gray-800">{fmt(item.qty)}</td>
                              <td className="px-4 py-2 text-right text-gray-800">{fmt(item.rate)}</td>
                              <td className="px-4 py-2 text-right font-medium text-gray-900">{fmt(item.amount)}</td>
                            </tr>
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
