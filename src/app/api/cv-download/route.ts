import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessCandidateCv } from '@/lib/candidate-access'

export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get('profileId')
  if (!profileId) return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const admin = createAdminClient()
    const { data: profile, error } = await admin.from('seeker_profiles')
      .select('id, user_id, cv_url').eq('id', profileId).maybeSingle()
    if (error) throw error
    if (!profile || !await canAccessCandidateCv(admin, user.id, profile.user_id)) {
      return NextResponse.json({ error: 'CV not available' }, { status: 404 })
    }
    const { data: ownsObject, error: ownershipError } = await admin.rpc('owns_cv_object', {
      p_user_id: profile.user_id, p_path: profile.cv_url,
    })
    if (ownershipError) throw ownershipError
    if (!ownsObject) return NextResponse.json({ error: 'CV not available' }, { status: 404 })
    const { data, error: signError } = await admin.storage.from('cvs')
      .createSignedUrl(profile.cv_url, 300, { download: true })
    if (signError || !data?.signedUrl) throw signError || new Error('Signing failed')
    return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[cv-download] Failed:', error)
    return NextResponse.json({ error: 'CV service temporarily unavailable. Please retry.' }, { status: 503 })
  }
}
