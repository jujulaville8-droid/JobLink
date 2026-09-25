import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EmployerAccountGate from '@/components/EmployerAccountGate'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Browse candidates', robots: { index: false, follow: false } }

export default async function MembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signup?role=employer&returnTo=%2Fmembers')
  const { data: account, error } = await supabase.from('users')
    .select('role, email_verified, is_banned').eq('id', user.id).single()
  if ((!error && !account) || error?.code === 'PGRST116') redirect('/verify-email?returnTo=%2Fmembers')
  if (error || !account) {
    return <main className="mx-auto max-w-lg px-6 py-20"><h1 className="text-2xl font-bold">Unable to check your account</h1><p>Please try again shortly.</p></main>
  }
  if (account.is_banned) redirect('/?suspended=1')
  if (!user.email_confirmed_at || !account.email_verified) redirect('/verify-email?returnTo=%2Fmembers')
  if (account.role === 'employer') redirect('/browse-candidates')
  return <EmployerAccountGate allowSetup={account.role === 'seeker'} />
}
