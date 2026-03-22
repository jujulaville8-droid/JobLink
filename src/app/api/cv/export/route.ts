import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchFullCv } from '@/lib/cv-helpers'
import { renderToBuffer } from '@react-pdf/renderer'
import { CvDocument } from '@/lib/cv-pdf'
import React from 'react'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const cv = await fetchFullCv(user.id)
    if (!cv) return NextResponse.json({ error: 'No CV found' }, { status: 404 })

    const buffer = await renderToBuffer(React.createElement(CvDocument, { cv }))

    const fullName = [cv.contact.first_name, cv.contact.last_name].filter(Boolean).join('_') || 'CV'
    const fileName = `${fullName}_CV.pdf`

    return new Response(buffer, {
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
