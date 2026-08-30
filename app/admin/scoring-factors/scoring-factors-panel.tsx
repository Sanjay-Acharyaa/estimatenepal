'use client'

import { useState } from 'react'

type Props = {
  weightPrice: number
  weightQty: number
  outlierThreshold: number
}

export default function ScoringFactorsPanel({ weightPrice, weightQty, outlierThreshold }: Props) {
  const [price, setPrice] = useState(String(weightPrice))
  const [qty, setQty] = useState(String(weightQty))
  const [outlier, setOutlier] = useState(String(outlierThreshold))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const priceNum = parseFloat(price) || 0
  const qtyNum = parseFloat(qty) || 0
  const sum = Math.round((priceNum + qtyNum) * 100) / 100
  const sumOk = sum === 100

  async function handleSave() {
    setError(null)
    setSuccess(false)
    if (!sumOk) {
      setError(`Price weight and quantity weight must sum to 100%. Current sum: ${sum}%.`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/scoring-factors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoring_weight_price: priceNum,
          scoring_weight_quantity: qtyNum,
          outlier_flagging_threshold_percentage: parseFloat(outlier) || 30,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error?.message ?? 'Save failed.')
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch {
      setError('Network error. Please retry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className={`rounded-md px-4 py-3 text-sm font-medium ${sumOk ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
        Price weight + Quantity weight = <strong>{sum}%</strong>
        {sumOk ? ' (valid)' : ' - must equal 100%'}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price Score Weight (%)</label>
          <p className="text-xs text-gray-400 mb-2">How much the bid price influences the final score. Default: 70.</p>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={price}
            onChange={e => setPrice(e.target.value)}
            disabled={saving}
            className="w-32 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Score Weight (%)</label>
          <p className="text-xs text-gray-400 mb-2">How much BOQ quantity accuracy influences the final score. Default: 30.</p>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={qty}
            onChange={e => setQty(e.target.value)}
            disabled={saving}
            className="w-32 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Outlier Flagging Threshold (%)</label>
          <p className="text-xs text-gray-400 mb-2">Bids deviating more than this percentage from the mean total are flagged as outliers. Default: 30.</p>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={outlier}
            onChange={e => setOutlier(e.target.value)}
            disabled={saving}
            className="w-32 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-green-600">Scoring weights saved.</p>}

        <button
          onClick={handleSave}
          disabled={saving || !sumOk}
          className="rounded px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Weights'}
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Changes take effect on the next scoring run. Active tenders that have already been scored will not be automatically re-scored.
      </p>
    </div>
  )
}
