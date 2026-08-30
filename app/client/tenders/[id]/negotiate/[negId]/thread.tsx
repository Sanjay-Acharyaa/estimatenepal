'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export interface NegotiationDetail {
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

export interface ThreadMessage {
  id: number
  sender_user_id: number
  sender_name: string
  message_type: string
  message_text: string
  created_at: string
}

interface Props {
  tenderId: number
  clientUserId: number
  negotiation: NegotiationDetail
  initialMessages: ThreadMessage[]
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtNPR(s: string | number | null): string {
  if (s === null || s === undefined) return '—'
  return `NPR ${Number(s).toLocaleString('en-NP', { maximumFractionDigits: 0 })}`
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function NegotiationThread({ tenderId, clientUserId, negotiation: initNeg, initialMessages }: Props) {
  const router = useRouter()
  const [neg, setNeg] = useState(initNeg)
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [discountPct, setDiscountPct] = useState(initNeg.proposed_discount_percentage)
  const [updatingDiscount, setUpdatingDiscount] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)

  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isActive = neg.status === 'ACTIVE'
  const originalTotal = Number(neg.original_grand_total_npr)
  const computedProposedTotal = originalTotal * (1 - discountPct / 100)

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/tenders/${tenderId}/negotiations/${neg.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_text: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) { router.push('/login'); return }
        setSendError(data.error?.message ?? 'Failed to send message.')
        return
      }
      setMessages((prev) => [
        ...prev,
        {
          id: data.message.id,
          sender_user_id: clientUserId,
          sender_name: 'You',
          message_type: 'TEXT',
          message_text: text,
          created_at: data.message.created_at ?? new Date().toISOString(),
        },
      ])
      setDraft('')
    } catch {
      setSendError('Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  async function updateDiscount() {
    setUpdatingDiscount(true)
    setDiscountError(null)
    try {
      const res = await fetch(`/api/tenders/${tenderId}/negotiations/${neg.id}/discount`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposed_discount_percentage: discountPct,
          current_proposed_total_npr: computedProposedTotal,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) { router.push('/login'); return }
        setDiscountError(data.error?.message ?? 'Failed to update discount.')
        return
      }
      const updated = data.negotiation
      setNeg((prev) => ({
        ...prev,
        proposed_discount_percentage: Number(updated.proposed_discount_percentage ?? prev.proposed_discount_percentage),
        current_proposed_total_npr: String(updated.current_proposed_total_npr ?? prev.current_proposed_total_npr),
      }))
      setDiscountPct(Number(updated.proposed_discount_percentage ?? discountPct))
    } catch {
      setDiscountError('Network error. Please try again.')
    } finally {
      setUpdatingDiscount(false)
    }
  }

  async function acceptAndAward() {
    if (!confirm(`Accept negotiation with ${neg.bidder_name} and award the project at ${fmtNPR(neg.current_proposed_total_npr)}?\n\nThis will award the project and cannot be undone.`)) return
    setAccepting(true)
    setAcceptError(null)
    try {
      const res = await fetch(`/api/tenders/${tenderId}/negotiations/${neg.id}/accept`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) { router.push('/login'); return }
        setAcceptError(data.error?.message ?? 'Failed to accept.')
        return
      }
      router.push(`/client/tenders/${tenderId}/award`)
    } catch {
      setAcceptError('Network error. Please try again.')
    } finally {
      setAccepting(false)
    }
  }

  async function closeNegotiation() {
    if (!confirm(`Close negotiation with ${neg.bidder_name} without agreement?`)) return
    setClosing(true)
    setCloseError(null)
    try {
      const res = await fetch(`/api/tenders/${tenderId}/negotiations/${neg.id}/close`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setCloseError(data.error?.message ?? 'Failed to close.')
        return
      }
      setNeg((prev) => ({ ...prev, status: 'CLOSED_NO_AGREEMENT', closed_at: new Date().toISOString() }))
    } catch {
      setCloseError('Network error. Please try again.')
    } finally {
      setClosing(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Sidebar */}
      <div className="space-y-4">
        {/* Summary */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Summary</p>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Original bid</span>
              <span className="font-medium text-gray-900">{fmtNPR(neg.original_grand_total_npr)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Proposed</span>
              <span className="font-medium text-gray-900">{fmtNPR(neg.current_proposed_total_npr)}</span>
            </div>
            {neg.proposed_discount_percentage > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Discount</span>
                <span className="font-medium">{neg.proposed_discount_percentage}%</span>
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 pt-2 space-y-1">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              isActive ? 'bg-green-100 text-green-700'
              : neg.status === 'CLOSED_AGREEMENT' ? 'bg-purple-100 text-purple-700'
              : 'bg-gray-100 text-gray-500'
            }`}>
              {isActive ? 'Active' : neg.status === 'CLOSED_AGREEMENT' ? 'Agreed' : 'Closed'}
            </span>
            {neg.deadline && <p className="text-xs text-gray-400">Deadline: {fmtDate(neg.deadline)}</p>}
            {neg.closed_at && <p className="text-xs text-gray-400">Closed: {fmtDate(neg.closed_at)}</p>}
          </div>
        </div>

        {isActive && (
          <>
            {/* Proposed discount */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Proposed discount</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                  min={0} max={100} step={0.1}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
              <p className="text-xs text-gray-500">
                Proposed total:{' '}
                <strong className="text-gray-800">{fmtNPR(computedProposedTotal.toFixed(2))}</strong>
              </p>
              {discountError && <p className="text-xs text-red-600">{discountError}</p>}
              <button
                onClick={updateDiscount}
                disabled={updatingDiscount}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {updatingDiscount ? 'Saving…' : 'Update discount'}
              </button>
            </div>

            {/* Accept & award */}
            <div className="rounded-xl border border-green-200 bg-white p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Accept & Award</p>
              <p className="text-xs text-gray-500">
                Award the project to {neg.bidder_name} at the proposed price. This cannot be undone.
              </p>
              {acceptError && <p className="text-xs text-red-600">{acceptError}</p>}
              <button
                onClick={acceptAndAward}
                disabled={accepting}
                className="w-full rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {accepting ? 'Awarding…' : 'Accept & award project'}
              </button>
            </div>

            {/* Close without agreement */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              {closeError && <p className="text-xs text-red-600">{closeError}</p>}
              <button
                onClick={closeNegotiation}
                disabled={closing}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                {closing ? 'Closing…' : 'Close without agreement'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Thread */}
      <div className="lg:col-span-2 flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '520px', minHeight: '320px' }}>
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No messages yet. Start the conversation below.</p>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_user_id === clientUserId
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-sm rounded-2xl px-4 py-2.5 ${isMe ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                    {!isMe && <p className="mb-1 text-xs font-semibold text-gray-500">{m.sender_name}</p>}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.message_text}</p>
                    <p className={`mt-1 text-right text-xs ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                      {fmtDate(m.created_at)}
                    </p>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {isActive ? (
          <div className="border-t border-gray-100 p-4">
            <form onSubmit={sendMessage} className="flex gap-2 items-end">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(e as unknown as React.FormEvent)
                  }
                }}
                rows={2}
                placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? '…' : 'Send'}
              </button>
            </form>
            {sendError && <p className="mt-1 text-xs text-red-600">{sendError}</p>}
          </div>
        ) : (
          <div className="border-t border-gray-100 p-4">
            <p className="text-center text-sm text-gray-400">This negotiation is closed.</p>
          </div>
        )}
      </div>
    </div>
  )
}
