import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit'

// Buckets the site uploads to, all keyed `${userId}/<file>`.
const USER_FILE_BUCKETS = ['cvs', 'avatars', 'company-logos', 'cover-letters']
const LIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due']
const PAGE_SIZE = 1000

function check({ error }: { error: unknown }) {
  if (error) throw error
}

// list() is not recursive: subfolders come back as entries with a null id.
async function listFiles(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  folder: string
): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: entries, error } = await admin.storage.from(bucket).list(folder, { limit: PAGE_SIZE, offset })
    if (error) throw error
    for (const entry of entries ?? []) {
      const path = `${folder}/${entry.name}`
      if (entry.id === null) paths.push(...await listFiles(admin, bucket, path))
      else paths.push(path)
    }
    if (!entries || entries.length < PAGE_SIZE) return paths
  }
}

/**
 * POST /api/account/delete
 *
 * Permanently deletes the signed-in user's data and auth account, for the
 * app's in-app deletion flow. Every step is idempotent: if one fails the caller
 * stays signed in and can retry to finish the job.
 */
export async function POST(request: NextRequest) {
  try {
    // Bearer only: refusing cookie auth means a cross-site form post can never
    // reach this route with a browser session.
    if (!request.headers.get('authorization')?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Deliberately NOT requireVerifiedUser: a user whose verification never
    // synced must still be able to delete their account. requireUser still
    // authenticates the caller and rejects banned accounts.
    const auth = await requireUser()
    if ('error' in auth) return auth.error
    const { user } = auth

    const admin = createAdminClient()

    // requireUser treats a failed lookup as "not admin", so re-read the flag with
    // the service role and refuse to continue if it cannot be confirmed.
    const { data: caller, error: callerError } = await admin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
    // Fail closed on a lookup ERROR. A missing row is not an error: it cannot
    // be an admin account, and treating it as one would trap a user whose first
    // deletion attempt removed this row but failed before the auth user went.
    if (callerError) {
      return NextResponse.json(
        { error: 'We could not verify your account. Please try again shortly.' },
        { status: 503 }
      )
    }

    // Admin-posted jobs route applicant messages to the admin account, so
    // removing it must stay a deliberate, manual operation.
    if (caller?.is_admin === true) {
      return NextResponse.json(
        { error: 'Admin accounts cannot be deleted from the app. Please contact support.' },
        { status: 403 }
      )
    }

    const limited = await enforceRateLimit(`account-delete:${user.id}`, RateLimits.accountDelete)
    if (limited) return limited

    // Role switching means one user can own both of these, so never branch on role.
    const { data: seeker, error: seekerError } = await admin
      .from('seeker_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (seekerError) throw seekerError

    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (companyError) throw companyError

    // Deleting our rows would not stop Stripe billing, and would lose the only
    // link back to the subscription.
    if (company) {
      const { data: subscriptions, error: subscriptionError } = await admin
        .from('subscriptions')
        .select('id')
        .eq('company_id', company.id)
        .in('status', LIVE_SUBSCRIPTION_STATUSES)
        .limit(1)
      if (subscriptionError) throw subscriptionError
      if (subscriptions?.length) {
        return NextResponse.json(
          { error: 'Your employer subscription is still active. Please contact JobLinks to cancel it before deleting your account.' },
          { status: 409 }
        )
      }
    }

    // Files first: once the auth user is gone the caller can no longer retry,
    // so a failed removal here must stop the deletion.
    for (const bucket of USER_FILE_BUCKETS) {
      const paths = await listFiles(admin, bucket, user.id)
      for (let i = 0; i < paths.length; i += PAGE_SIZE) {
        check(await admin.storage.from(bucket).remove(paths.slice(i, i + PAGE_SIZE)))
      }
    }

    // JobLink Verified: the stored police record and any ID image waiting for
    // review are encrypted files in a private folder keyed by verification id,
    // not by user, so they are found through the records. Same rule as above:
    // a failed removal stops the deletion. The records themselves (checks,
    // shares, view history, audit log) go with the profile through CASCADE.
    const verifications = await admin
      .from('seeker_verifications')
      .select('id, rtw_file_path, police_record_file_path')
      .eq('user_id', user.id)
    // Tolerated only when the Verified tables have not been migrated yet.
    const verificationTableMissing = ['42P01', 'PGRST205'].includes(verifications.error?.code ?? '')
    if (verifications.error && !verificationTableMissing) throw verifications.error
    if (verifications.data?.length) {
      const { privateVerificationStorage } = await import('@/lib/verification/files')
      const storage = await privateVerificationStorage(admin)
      const paths = new Set<string>()
      for (const row of verifications.data) {
        if (row.rtw_file_path) paths.add(row.rtw_file_path)
        if (row.police_record_file_path) paths.add(row.police_record_file_path)
        // Anything else left in the folder, such as a replaced upload.
        const listed = await storage.list(row.id, { limit: 100 })
        check(listed)
        for (const file of listed.data ?? []) paths.add(`${row.id}/${file.name}`)
      }
      if (paths.size) check(await storage.remove([...paths]))
      check(await admin.from('seeker_verifications').delete().eq('user_id', user.id))
    }

    if (seeker) {
      check(await admin.from('applications').delete().eq('seeker_id', seeker.id))
      check(await admin.from('saved_jobs').delete().eq('seeker_id', seeker.id))
      check(await admin.from('seeker_profiles').delete().eq('id', seeker.id))
    }
    if (company) {
      check(await admin.from('job_listings').delete().eq('company_id', company.id))
      check(await admin.from('companies').delete().eq('id', company.id))
    }
    // Both can hold the user's email but would outlive them: the reminder log has
    // no foreign key, and cv_events only sets user_id to null.
    check(await admin.from('signup_reminder_log').delete().eq('auth_user_id', user.id))
    check(await admin.from('cv_events').delete().eq('user_id', user.id))
    // Enquiries are keyed by email only, with no link to the user's id.
    if (user.email) {
      check(await admin.from('employer_enquiries').delete().eq('email', user.email))
    }
    check(await admin.from('users').delete().eq('id', user.id))

    // Everything else keyed to the user (messages, CV builder rows, alerts,
    // notification logs) goes with these rows through ON DELETE CASCADE.
    check(await admin.auth.admin.deleteUser(user.id))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[account-delete] Failed', err)
    return NextResponse.json(
      { error: 'We could not delete your account. Please try again or contact JobLinks.' },
      { status: 500 }
    )
  }
}
