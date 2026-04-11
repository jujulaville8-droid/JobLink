import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get('profileId')

  if (!profileId) {
    return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminClient = createAdminClient()

  const { data: caller } = await adminClient
    .from('users')
    .select('role, is_admin')
    .eq('id', user.id)
    .single()

  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: profile } = await adminClient
    .from('seeker_profiles')
    .select('id, user_id, cv_url')
    .eq('id', profileId)
    .single()

  if (!profile?.cv_url) {
    return NextResponse.json({ error: 'CV not found' }, { status: 404 })
  }

  const isAdmin = caller.is_admin === true || caller.role === 'admin'

  if (!isAdmin) {
    if (caller.role === 'seeker') {
      if (profile.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (caller.role === 'employer') {
      const { data: company } = await adminClient
        .from('companies')
        .select('id, is_pro, pro_expires_at')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!company) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Premium employers can browse/export candidate resumes.
      // Non-premium (or expired) employers must be related via an application.
      const isProActive =
        company.is_pro === true &&
        (!company.pro_expires_at || new Date(company.pro_expires_at) > new Date())

      if (!isProActive) {
        const { data: hasRelationship } = await adminClient
          .from('applications')
          .select('id, job_listings!inner(company_id)')
          .eq('seeker_id', profile.id)
          .eq('job_listings.company_id', company.id)
          .limit(1)
          .maybeSingle()

        if (!hasRelationship) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data: signedUrlData, error: signError } = await adminClient.storage
    .from('cvs')
    .createSignedUrl(profile.cv_url, 3600, { download: true })

  if (signError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: 'Failed to generate download link' },
      { status: 500 }
    )
  }

  return NextResponse.redirect(signedUrlData.signedUrl)
}
