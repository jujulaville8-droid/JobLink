import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchFullCv } from '@/lib/cv-helpers'
import { renderToBuffer } from '@react-pdf/renderer'
import { createCvDocument, type ThemeId, THEME_LIST } from '@/lib/cv-pdf'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Allow employers to export a seeker's resume via ?userId=
    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId') || user.id

    // If requesting another user's resume, verify caller is an employer
    if (targetUserId !== user.id) {
      const { data: caller } = await supabase
        .from('users')
        .select('role, is_admin')
        .eq('id', user.id)
        .single()

      if (!caller || (caller.role !== 'employer' && !caller.is_admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const cv = await fetchFullCv(targetUserId, targetUserId !== user.id)
    if (!cv) return NextResponse.json({ error: 'No resume found' }, { status: 404 })

    const themeParam = searchParams.get('theme') || 'modern'
    const theme = THEME_LIST.some(t => t.id === themeParam) ? themeParam as ThemeId : 'modern'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(createCvDocument(cv, theme) as any)
    const bytes = new Uint8Array(buffer)

    const fullName = [cv.contact.first_name, cv.contact.last_name].filter(Boolean).join('_') || 'Resume'
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
