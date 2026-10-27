import { ownedCvPath, validateCvFile } from '@/lib/cv-upload'
import { NextRequest, NextResponse } from 'next/server'
import { calculateProfileCompletion } from '@/lib/profile-completion'
import { requireVerifiedUser } from '@/lib/api-auth'
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit'
import { parseSeekerDetails, parseSensitiveDetails, type SensitiveDetails } from '@/lib/seeker-details'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const limited = await enforceRateLimit(`profile:${user.id}`, RateLimits.profileWrite)
    if (limited) return limited

    // Ensure user row exists in public.users (trigger may have failed)
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!userRow) {
      const metadataRole = user.user_metadata?.role
      const { error: userInsertError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email!,
          role: metadataRole === 'employer' ? 'employer' : 'seeker',
        })

      if (userInsertError && userInsertError.code !== '23505') {
        console.error('Failed to create user row:', userInsertError)
        return NextResponse.json(
          { error: 'Account setup failed. Please contact support.' },
          { status: 500 }
        )
      }
    }

    const body = await request.json()
    const { profile_id, details, sensitive, ...profileData } = body

    // Optional deeper profile sections. Practical details are stored on the
    // profile; sensitive ones in an admin-only table (see seeker-details.ts).
    let sensitiveDetails: SensitiveDetails | null = null
    let detailFields: Record<string, unknown> = {}
    if (details !== undefined) {
      const parsed = parseSeekerDetails(details)
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
      detailFields = parsed.value
    }
    if (sensitive !== undefined) {
      const parsed = parseSensitiveDetails(sensitive)
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
      sensitiveDetails = parsed.value
    }

    // Whitelist allowed fields — never accept arbitrary input
    const payload: Record<string, unknown> = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    }

    const allowedFields = [
      'first_name', 'last_name', 'phone', 'location', 'bio',
      'skills', 'experience_years', 'education', 'cv_url',
      'avatar_url', 'visibility',
    ] as const

    for (const field of allowedFields) {
      if (profileData[field] !== undefined) {
        payload[field] = profileData[field]
      }
    }

    // Unchanged CVs must not block unrelated edits, including dangling/legacy paths.
    if (payload.cv_url) {
      const { data: currentProfile, error: readError } = await supabase
        .from('seeker_profiles')
        .select('cv_url')
        .eq('user_id', user.id)
        .maybeSingle()
      if (readError) throw readError

      const normalizeCvUrl = (value: unknown): unknown => {
        if (typeof value === 'string' && /^https?:/i.test(value)) {
          try {
            const url = new URL(value)
            const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin
            const prefix = ['/storage/v1/object/public/cvs/', '/storage/v1/object/sign/cvs/']
              .find(value => url.pathname.startsWith(value))
            if (url.origin === origin && !url.username && !url.password && prefix) {
              return decodeURIComponent(url.pathname.slice(prefix.length))
            }
          } catch { /* Preserve legacy values for the unchanged-path comparison. */ }
        }
        return value
      }
      payload.cv_url = normalizeCvUrl(payload.cv_url)
      if (payload.cv_url !== normalizeCvUrl(currentProfile?.cv_url)) {
        if (!ownedCvPath(payload.cv_url, user.id)) {
          return NextResponse.json({ error: 'Invalid resume path. Upload your resume again before saving.' }, { status: 400 })
        }
        try {
          const { data: stored, error: storageError } = await supabase.storage.from('cvs').info(payload.cv_url)
          // Storage can return missing objects as an error (including legacy errors).
          const missing = storageError && (
            ('code' in storageError && storageError.code === 'NoSuchKey') ||
            ('error' in storageError && storageError.error === 'NoSuchKey') ||
            ('statusCode' in storageError && String(storageError.statusCode) === '404') ||
            /^(object not found|not found)$/i.test(storageError.message)
          )
          if (missing || (!storageError && !stored)) {
            return NextResponse.json({ error: 'Your resume upload could not be confirmed. Check your connection and upload it again before saving.' }, { status: 400 })
          }
          if (storageError) throw storageError
          if (stored) {
            const checked = validateCvFile({ name: payload.cv_url, size: stored.size ?? stored.metadata?.size ?? 0 })
            if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 })
          }
        } catch (error) {
          // An unavailable info endpoint must not turn profile saves into an outage.
          console.error('Profile CV storage verification failed; allowing save:', { userId: user.id, error })
        }
      }
    }

    Object.assign(payload, detailFields)

    // Check if user has a built resume (for completion calc)
    const { data: cvProfile } = await supabase
      .from('cv_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    // Calculate profile completion server-side
    const { percentage } = calculateProfileCompletion({
      first_name: payload.first_name as string || null,
      last_name: payload.last_name as string || null,
      phone: payload.phone as string || null,
      bio: payload.bio as string || null,
      skills: payload.skills as string[] || null,
      experience_years: payload.experience_years as number || null,
      education: payload.education as string || null,
      cv_url: payload.cv_url as string || null,
      has_cv_profile: !!cvProfile,
    })

    payload.profile_complete_pct = percentage

    let error
    let newProfileId: string | null = null

    if (profile_id) {
      const result = await supabase
        .from('seeker_profiles')
        .update(payload)
        .eq('id', profile_id)
        .eq('user_id', user.id)
        .select('id')
        .single()
      error = result.error
    } else {
      const result = await supabase
        .from('seeker_profiles')
        .insert(payload)
        .select('id')
        .single()
      error = result.error
      if (result.data) {
        newProfileId = result.data.id
      }
    }

    if (error) {
      console.error('Profile save error:', error)
      return NextResponse.json(
        { error: 'Could not save your profile and resume. Please try again, or email support@joblinkantigua.com.' },
        { status: 500 }
      )
    }

    const savedProfileId = newProfileId || profile_id

    if (sensitiveDetails && savedProfileId) {
      // RLS: only the profile owner can write; nobody but admins can read it back.
      const empty = sensitiveDetails.marital_status === null && sensitiveDetails.children_count === null
      const { error: sensitiveError } = empty
        ? await supabase.from('seeker_sensitive_details').delete().eq('seeker_id', savedProfileId)
        : await supabase.from('seeker_sensitive_details').upsert(
          { seeker_id: savedProfileId, ...sensitiveDetails, updated_at: new Date().toISOString() },
          { onConflict: 'seeker_id' },
        )
      if (sensitiveError) {
        console.error('Sensitive details save error:', sensitiveError.code)
        return NextResponse.json(
          { error: 'Profile saved, but your optional personal details could not be saved. Please try again.', profile_id: savedProfileId },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      profile_id: savedProfileId,
    })
  } catch (err) {
    console.error('Profile API error:', err)
    return NextResponse.json({ error: 'Could not save your profile and resume. Check your connection and try again, or email support@joblinkantigua.com.' }, { status: 500 })
  }
}
