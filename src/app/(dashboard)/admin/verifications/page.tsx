import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasTwoStepSession } from '@/lib/api-auth'
import VerificationReview from '@/components/verification/VerificationReview'
import { verificationEnabled } from '@/lib/verification/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Verifications', robots: { index: false } }

/** Review queue. Reachable only by admins who have passed two-step login in this session. */
export default async function AdminVerificationsPage() {
  if (!verificationEnabled()) notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: account } = await supabase.from('users').select('is_admin, is_banned').eq('id', user.id).single()
  if (account?.is_admin !== true || account.is_banned === true) redirect('/dashboard')
  if (!(await hasTwoStepSession(supabase))) redirect('/two-step?next=/admin/verifications')
  return <VerificationReview />
}
