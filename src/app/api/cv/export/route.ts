import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchFullCv } from '@/lib/cv-helpers'
import { renderToBuffer } from '@react-pdf/renderer'
import { createCvDocument, type ThemeId, THEME_LIST } from '@/lib/cv-pdf'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId') || user.id

    if (targetUserId !== user.id) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()

      const { data: caller } = await admin
        .from('users')
        .select('role, is_admin')
        .eq('id', user.id)
        .single()

      const isAdmin = caller?.is_admin === true || caller?.role === 'admin'

      if (!isAdmin) {
        if (!caller || caller.role !== 'employer') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { data: company } = await admin
          .from('companies')
          .select('id, is_pro, pro_expires_at')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!company) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Premium employers can export any candidate CV from browse-candidates.
        // Non-premium (or expired) employers can only export resumes for
        // candidates related to one of their applications.
        const isProActive =
          company.is_pro === true &&
          (!company.pro_expires_at || new Date(company.pro_expires_at) > new Date())

        if (!isProActive) {
          const { data: hasRelationship } = await admin
            .from('applications')
            .select('id, seeker_profiles!inner(user_id), job_listings!inner(company_id)')
            .eq('seeker_profiles.user_id', targetUserId)
            .eq('job_listings.company_id', company.id)
            .limit(1)
            .maybeSingle()

          if (!hasRelationship) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
        }
      }
    }

    const cv = await fetchFullCv(targetUserId, targetUserId !== user.id)
    if (!cv) return NextResponse.json({ error: 'No resume found' }, { status: 404 })

    const themeParam = searchParams.get('theme') || 'classic'
    const theme = THEME_LIST.some((t) => t.id === themeParam)
      ? (themeParam as ThemeId)
      : 'classic'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(createCvDocument(cv, theme) as any)
    const bytes = new Uint8Array(buffer)

    const fullName =
      [cv.contact.first_name, cv.contact.last_name].filter(Boolean).join('_') ||
      'Resume'
    const fileName = `${fullName}_Resume.pdf`

    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err) {
    console.error('[cv-export] PDF generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
