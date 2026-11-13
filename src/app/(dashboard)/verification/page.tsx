import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VerificationPanel from '@/components/verification/VerificationPanel'
import { verificationEnabled } from '@/lib/verification/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'JobLink Verified', robots: { index: false } }

/** Everything a job seeker does for Verified lives here; the page changes with their status. */
export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ paid?: string; cancelled?: string }> }) {
  if (!verificationEnabled()) notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: account } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (account?.role !== 'seeker') redirect('/dashboard')
  const query = await searchParams
  return <VerificationPanel justPaid={query.paid === '1'} cancelled={query.cancelled === '1'} />
}
