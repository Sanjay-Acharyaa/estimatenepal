import { redirect } from 'next/navigation'

export default function TendersPage() {
  redirect('/api/auth/sso-token?return_to=/bid/tenders')
}
