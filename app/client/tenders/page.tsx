import { redirect } from 'next/navigation'

export default function ClientTendersPage() {
  redirect('/api/auth/sso-token?return_to=/bid/client/tenders')
}
