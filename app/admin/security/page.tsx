'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function AdminSecurityPage() {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (passphrase.length < 12) { setError('Passphrase must be at least 12 characters.'); return }
    if (passphrase !== confirm) { setError('Passphrases do not match.'); return }

    const phrase = passphrase
    setPassphrase('')
    setConfirm('')
    setSaving(true)

    try {
      const res = await fetch('/api/admin/auth/set-passphrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: phrase }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error?.message ?? 'Save failed.')
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 4000)
      }
    } catch {
      setError('Network error. Please retry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-sm text-red-200 hover:text-white">Back to Admin</Link>
        <span className="font-bold text-lg">Admin Security</span>
      </div>

      <div className="p-8 max-w-md">
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Secondary Passphrase</h2>
          <p className="text-xs text-gray-500">
            This passphrase is required to view confidential bid data (all contractor rates and totals for any tender).
            Set it once and keep it private. Minimum 12 characters.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder="New passphrase (min 12 chars)"
              disabled={saving}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
            />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Confirm passphrase"
              disabled={saving}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            {success && <p className="text-xs text-green-600">Passphrase updated successfully.</p>}
            <button
              type="submit"
              disabled={saving || !passphrase || !confirm}
              className="rounded px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Update Passphrase'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
