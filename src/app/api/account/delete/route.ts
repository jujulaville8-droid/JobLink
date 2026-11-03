import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit'

// Buckets the site uploads to, all keyed `${userId}/<file>`.
const USER_FILE_BUCKETS = ['cvs', 'avatars', 'company-logos']
const LIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due']
const PAGE_SIZE = 1000

function check({ error }: { error: unknown }) {
  if (error) throw error
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
    const { user, isAdmin } = auth

    // Admin-posted jobs route applicant messages to the admin account, so
    // removing it must stay a deliberate, manual operation.
    if (isAdmin) {
      return NextResponse.json(
        { error: 'Admin accounts cannot be deleted from the app. Please contact support.' },
        { status: 403 }
      )
    }

    const limited = await enforceRateLimit(`account-delete:${user.id}`, RateLimits.accountDelete)
    if (limited) return limited

    const admin = createAdminClient()

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
      for (;;) {
        const { data: files, error } = await admin.storage.from(bucket).list(user.id, { limit: PAGE_SIZE })
        if (error) throw error
        if (!files?.length) break
        check(await admin.storage.from(bucket).remove(files.map(file => `${user.id}/${file.name}`)))
        if (files.length < PAGE_SIZE) break
      }
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
