import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import ScoringFactorsPanel from './scoring-factors-panel'

export default async function ScoringFactorsPage() {
  const rows = await prisma.bidPlatformSetting.findMany({
    where: { key: { in: ['scoring_weight_price', 'scoring_weight_quantity', 'outlier_flagging_threshold_percentage'] } },
    select: { key: true, value: true },
  })

  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  const weightPrice = parseFloat(map['scoring_weight_price'] ?? '70')
  const weightQty = parseFloat(map['scoring_weight_quantity'] ?? '30')
  const outlierThreshold = parseFloat(map['outlier_flagging_threshold_percentage'] ?? '30')

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-sm text-red-200 hover:text-white">Back to Admin</Link>
        <span className="font-bold text-lg">Scoring Factors</span>
      </div>

      <div className="p-8">
        <p className="text-sm text-gray-500 mb-6">
          Configure how bids are scored when a client runs the scoring engine. Price weight and quantity weight must sum to 100%.
        </p>
        <ScoringFactorsPanel weightPrice={weightPrice} weightQty={weightQty} outlierThreshold={outlierThreshold} />
      </div>
    </div>
  )
}
