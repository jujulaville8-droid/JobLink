import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/api-auth'
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const limited = await enforceRateLimit(`alert:${user.id}`, RateLimits.alert)
    if (limited) return limited

    // Get seeker profile
    const { data: profile } = await supabase
      .from('seeker_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Seeker profile not found' }, { status: 404 })
    }

    const { keywords, industry, job_type } = await request.json()

    // Validate at least one filter
    const hasKeywords = keywords && Array.isArray(keywords) && keywords.length > 0
    if (!hasKeywords && !industry && !job_type) {
      return NextResponse.json({ error: 'At least one filter is required' }, { status: 400 })
    }

    // Check for duplicate alert
    let dupeQuery = supabase
      .from('job_alerts')
      .select('id')
      .eq('seeker_id', profile.id)

    if (hasKeywords) {
      dupeQuery = dupeQuery.contains('keywords', keywords)
    } else {
      dupeQuery = dupeQuery.is('keywords', null)
    }

    if (industry) {
      dupeQuery = dupeQuery.eq('industry', industry)
    } else {
      dupeQuery = dupeQuery.is('industry', null)
    }

    if (job_type) {
      dupeQuery = dupeQuery.eq('job_type', job_type)
    } else {
      dupeQuery = dupeQuery.is('job_type', null)
    }

    const { data: existing } = await dupeQuery.maybeSingle()

    if (existing) {
      return NextResponse.json({ exists: true, message: 'Alert already exists' }, { status: 409 })
    }

    // Create the alert
    const { error: insertError } = await supabase
      .from('job_alerts')
      .insert({
        seeker_id: profile.id,
        keywords: hasKeywords ? keywords : null,
        industry: industry || null,
        job_type: job_type || null,
      })

    if (insertError) {
      console.error('[POST /api/alerts] Insert error:', insertError.message)
      return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
