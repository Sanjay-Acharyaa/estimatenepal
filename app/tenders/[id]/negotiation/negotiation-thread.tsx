'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface NegotiationDetail {
  id: number
  bidder_user_id: number
  status: string
  deadline: string | null
  original_grand_total_npr: string
  current_proposed_total_npr: string
  proposed_discount_percentage: number
  initiated_at: string
  closed_at: string | null
}

interface ThreadMessage {
  id: number
  sender_user_id: number
  sender_name: string
  message_type: string
  message_text: string
  created_at: string
}

interface Props {
  tenderId: number
  contractorUserId: number
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

export default function ContractorNegotiationThread({
  tenderId,
  contractorUserId,
  negotiation: initNeg,
  initialMessages,
}: Props) {
  const router = useRouter()
  const [neg] = useState(initNeg)
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isActive = neg.status === 'ACTIVE'

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
          sender_user_id: contractorUserId,
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Sidebar */}
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Summary</p>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Your original bid</span>
              <span className="font-medium text-gray-900">{fmtNPR(neg.original_grand_total_npr)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Proposed</span>
              <span className="font-medium text-gray-900">{fmtNPR(neg.current_proposed_total_npr)}</span>
            </div>
            {neg.proposed_discount_percentage > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Discount offered</span>
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

        {neg.status === 'CLOSED_AGREEMENT' && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-semibold text-green-800">Negotiation agreed</p>
            <p className="text-xs text-green-700 mt-1">
              The client has accepted the negotiated price. A formal Letter of Award will follow.
            </p>
          </div>
        )}

        {isActive && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-800 font-medium">Negotiation in progress</p>
            <p className="text-xs text-amber-700 mt-1">
              Use the thread to discuss pricing. The client will finalise the award.
            </p>
          </div>
        )}
      </div>

      {/* Thread */}
      <div className="lg:col-span-2 flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '520px', minHeight: '320px' }}>
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No messages yet. Wait for the client to start or send the first message.</p>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_user_id === contractorUserId
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
