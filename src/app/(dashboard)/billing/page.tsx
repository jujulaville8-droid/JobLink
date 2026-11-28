import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import EmployerBillingPanel from '@/components/employer-billing/EmployerBillingPanel'
import { employerBillingEnabled } from '@/lib/employer-billing/config'
import { employerBillingSummary } from '@/lib/employer-billing/summary'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Billing and Spotlight', robots: { index: false } }

/** Employer Pro status, Spotlight credits and campaigns, and purchases. */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ spotlight?: string; paid?: string }> }) {
  if (!employerBillingEnabled()) notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/employer/login')
  const db = createAdminClient()
  const [{ data: account }, { data: company }] = await Promise.all([
    db.from('users').select('role').eq('id', user.id).maybeSingle(),
    db.from('companies').select('id, company_name').eq('user_id', user.id).maybeSingle(),
  ])
  if (account?.role !== 'employer') redirect('/dashboard')
  if (!company) redirect('/company-profile')
  const summary = await employerBillingSummary(db, company.id, user.email_confirmed_at ? user.email ?? null : null)
  const query = await searchParams
  return <EmployerBillingPanel summary={summary} focusJobId={typeof query.spotlight === 'string' ? query.spotlight : null} justPaid={query.paid === '1'} />
}
