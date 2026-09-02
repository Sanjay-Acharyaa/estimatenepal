import { redirect } from 'next/navigation'

export default async function NegotiationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/api/auth/sso-token?return_to=/bid/tenders/${id}/negotiation`)
}
