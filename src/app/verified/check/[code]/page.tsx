import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeRateLimit } from '@/lib/rate-limit'
import { ShieldCheckIcon } from '@/components/verification/VerifiedBadge'
import { VerificationLimits, verificationEnabled } from '@/lib/verification/server'
import { antiguaToday, formatConfirmationCode, isRtwGroup, longDate, parseConfirmationCode, rtwStatusText } from '@/lib/verification/shared'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'JobLink verification check', robots: { index: false, follow: false } }

type Result =
  | { state: 'valid'; name: string; status: string; checkedOn: string; until: string }
  | { state: 'ended' | 'unknown' | 'limited' }

/**
 * Public check of a confirmation code: name, status and date, nothing more.
 * An ended badge says only that it has ended; an unknown code says nothing.
 */
async function check(code: string): Promise<Result> {
  const requestHeaders = await headers()
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || 'unknown'
  const limit = await consumeRateLimit(`verification:publicCheck:${ip}`, VerificationLimits.publicCheck)
  if (!limit.allowed) return { state: 'limited' }
  const { data } = await createAdminClient().from('seeker_verifications')
    .select('status, rtw_group, reviewed_at, verified_until, seeker_profiles(first_name, last_name)')
    .eq('confirmation_code', code).maybeSingle()
  if (!data) return { state: 'unknown' }
  if (data.status !== 'approved' || !data.verified_until || data.verified_until < antiguaToday() || !isRtwGroup(data.rtw_group) || !data.reviewed_at) {
    return { state: 'ended' }
  }
  const profile = Array.isArray(data.seeker_profiles) ? data.seeker_profiles[0] : data.seeker_profiles
  return {
    state: 'valid',
    name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Name unavailable',
    status: rtwStatusText(data.rtw_group),
    checkedOn: longDate(data.reviewed_at),
    until: longDate(data.verified_until),
  }
}

export default async function VerificationCheckPage({ params }: { params: Promise<{ code: string }> }) {
  if (!verificationEnabled()) notFound()
  const code = parseConfirmationCode((await params).code)
  const result: Result = code ? await check(code) : { state: 'unknown' }

  return (
    <div className="mx-auto min-h-[60vh] max-w-md px-4 py-16">
      <h1 className="font-display text-2xl font-bold text-text">Verification check</h1>
      {code && <p className="mt-1 font-mono text-sm text-text-muted">Code {formatConfirmationCode(code)}</p>}

      {result.state === 'valid' && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="flex items-center gap-2 font-semibold text-emerald-900"><ShieldCheckIcon className="h-5 w-5" /> This confirmation is genuine</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-emerald-800/80">Name</dt><dd className="font-medium text-emerald-950">{result.name}</dd></div>
            <div><dt className="text-emerald-800/80">Right to work</dt><dd className="font-medium text-emerald-950">{result.status}</dd></div>
            <div><dt className="text-emerald-800/80">Documents checked by JobLink on</dt><dd className="font-medium text-emerald-950">{result.checkedOn}</dd></div>
            <div><dt className="text-emerald-800/80">Valid until</dt><dd className="font-medium text-emerald-950">{result.until}</dd></div>
          </dl>
        </div>
      )}
      {result.state === 'ended' && (
        <div className="mt-6 rounded-2xl border border-border bg-bg-alt p-5">
          <p className="font-semibold text-text">This verification is no longer valid</p>
          <p className="mt-2 text-sm text-text-light">The badge has ended or the documents were withdrawn. Ask the applicant for a current confirmation.</p>
        </div>
      )}
      {result.state === 'unknown' && (
        <div className="mt-6 rounded-2xl border border-border bg-bg-alt p-5">
          <p className="font-semibold text-text">We couldn&apos;t find this code</p>
          <p className="mt-2 text-sm text-text-light">Check the code on the confirmation and try again.</p>
        </div>
      )}
      {result.state === 'limited' && (
        <div className="mt-6 rounded-2xl border border-border bg-bg-alt p-5" role="alert">
          <p className="font-semibold text-text">Too many checks</p>
          <p className="mt-2 text-sm text-text-light">Please wait a while and try again.</p>
        </div>
      )}

      <p className="mt-6 text-sm text-text-light">JobLink confirms that documents were checked on a date. It is not a reference or a guarantee.</p>
      <p className="mt-3 text-sm"><Link href="/verified/check" className="font-semibold text-primary underline">Check another code</Link> · <Link href="/verified" className="font-semibold text-primary underline">About JobLink Verified</Link></p>
    </div>
  )
}
