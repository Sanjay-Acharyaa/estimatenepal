import { redirect } from 'next/navigation'

export default async function BidPage({ params }: { params: Promise<{ id: string; bidId: string }> }) {
  const { id, bidId } = await params
  redirect(`/api/auth/sso-token?return_to=/bid/tenders/${id}/bids/${bidId}`)
}
