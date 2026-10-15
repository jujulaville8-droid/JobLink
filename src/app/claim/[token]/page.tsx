import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLAIM_TOKEN_PATTERN, CLAIM_UNAVAILABLE_MESSAGE, withReturnTo } from '@/lib/claim-links'
import ClaimAccountSwitch from '@/components/claims/ClaimAccountSwitch'
import ClaimCompanyButton from '@/components/claims/ClaimCompanyButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Claim your company', robots: { index: false, follow: false }, referrer: 'no-referrer',
}

function Message({ children }: { children: React.ReactNode }) {
  return <section className="mx-auto max-w-xl px-5 py-16"><h1 className="font-display text-3xl">Claim your company</h1><p className="my-6 text-text-light" role="status">{children}</p><a className="text-primary underline" href="mailto:employers@joblinkantigua.com">Contact the JobLink team</a></section>
}

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!CLAIM_TOKEN_PATTERN.test(token)) return <Message>{CLAIM_UNAVAILABLE_MESSAGE}</Message>
  // Tokens never leave server-only reads except for the current link's action.
  const admin = createAdminClient()
  const { data: claim, error: claimError } = await admin.from('company_claims')
    .select('company_id, expires_at, claimed_at').eq('token', token).maybeSingle()
  if (claimError) return <Message>We couldn’t load this claim. Please try again in a moment.</Message>
  // Request-time Server Component; expiry is checked again under lock in the RPC.
  // eslint-disable-next-line react-hooks/purity
  if (!claim || claim.claimed_at || new Date(claim.expires_at).getTime() <= Date.now()) return <Message>{CLAIM_UNAVAILABLE_MESSAGE}</Message>
  const { data: company, error: companyError } = await admin.from('companies')
    .select('id, company_name, user_id, claimed_at').eq('id', claim.company_id).maybeSingle()
  if (companyError) return <Message>We couldn’t load this company. Please try again in a moment.</Message>
  if (!company || company.claimed_at) return <Message>{CLAIM_UNAVAILABLE_MESSAGE}</Message>
  const { data: owner, error: ownerError } = await admin.from('users').select('email, role, is_banned').eq('id', company.user_id).maybeSingle()
  if (ownerError) return <Message>We couldn’t load this claim. Please try again in a moment.</Message>
  if (!owner || owner.is_banned || owner.role !== 'employer' || !/^admin-company-.+@joblinkantigua\.com$/.test(owner.email)) return <Message>{CLAIM_UNAVAILABLE_MESSAGE}</Message>

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const returnTo = `/claim/${token}`
  let restriction: string | null = null
  let needsVerification = false
  if (user) {
    const { data: profile, error } = await supabase.from('users').select('role, is_banned, email_verified').eq('id', user.id).maybeSingle()
    if (error || !profile) restriction = 'We couldn’t check your account. Please refresh and try again.'
    else if (profile.is_banned) restriction = 'This account is suspended. Please contact the JobLink team.'
    else if (profile.role !== 'employer') restriction = 'You’re signed in as a job seeker. Sign out and sign in with your employer account to claim this company.'
    else {
      const { data: owned, error: ownedError } = await supabase.from('companies').select('id').eq('user_id', user.id).maybeSingle()
      if (ownedError) restriction = 'We couldn’t check your company. Please refresh and try again.'
      else if (owned) restriction = 'You already manage a company. Contact employers@joblinkantigua.com for help. Companies cannot be merged automatically.'
      needsVerification = !user.email_confirmed_at || !profile.email_verified
    }
  }
  const { data: jobs, error: jobsError } = await admin.from('job_listings').select('id, title, location')
    .eq('company_id', company.id).eq('status', 'active')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order('created_at', { ascending: false })

  return <section className="mx-auto max-w-xl px-5 py-12 sm:py-16">
    <p className="mb-3 text-sm font-semibold text-primary">Your company on JobLink</p>
    <h1 className="font-display text-3xl sm:text-4xl">{company.company_name}</h1>
    <p className="mt-4 text-text-light">The JobLink team created this listing for your company. Claim it to manage your existing profile and jobs.</p>
    <div className="my-8 rounded-2xl border border-border bg-white p-5">
      <h2 className="mb-3 text-lg font-semibold">Live jobs</h2>
      {jobsError ? <p role="status">We couldn’t load the jobs. Refresh to try again.</p> : jobs?.length ? <ul className="divide-y divide-border">{jobs.map(job => <li className="py-3" key={job.id}><Link prefetch={false} className="font-medium text-primary underline" href={`/jobs/${job.id}`}>{job.title}</Link>{job.location && <p className="mt-1 text-sm text-text-light">{job.location}</p>}</li>)}</ul> : <p className="text-sm text-text-light">No live jobs right now. You can still claim and manage this company.</p>}
    </div>
    {restriction ? <div><p role="status" className="mb-4 text-text-light">{restriction}</p><a className="text-primary underline" href="mailto:employers@joblinkantigua.com">Contact the JobLink team</a><ClaimAccountSwitch returnTo={returnTo} /></div>
      : !user ? <div className="space-y-4"><Link prefetch={false} className="btn-primary flex min-h-12 items-center justify-center" href={withReturnTo('/employer/signup', returnTo)}>Claim this company</Link><p className="text-sm text-text-light">Create an employer account to continue, or <Link prefetch={false} className="text-primary underline" href={withReturnTo('/employer/login', returnTo)}>sign in</Link>. You’ll return here after verifying your email.</p></div>
      : needsVerification ? <Link prefetch={false} className="btn-primary inline-flex min-h-12 items-center" href={withReturnTo('/verify-email', returnTo)}>Verify your email to continue</Link>
      : <ClaimCompanyButton token={token} />}
  </section>
}
