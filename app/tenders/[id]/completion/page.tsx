import { redirect } from 'next/navigation'

export default async function CompletionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/api/auth/sso-token?return_to=/bid/tenders/${id}/completion`)
}
