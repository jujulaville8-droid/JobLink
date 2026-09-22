import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { intakeSchema, resumeSchema, RESUME_SYSTEM_PROMPT } from '@/lib/resume-schema'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!user.email_confirmed_at) return NextResponse.json({ error: 'Please verify your email first.' }, { status: 403 })
    const body = await req.json()
    const admin = createAdminClient()
    if (body.mode === 'unlock') {
      if (body.confirmed !== true || typeof body.previewCreatedAt !== 'string') {
        return NextResponse.json({ error: 'Review this draft and confirm replacing your resume first.' }, { status: 409 })
      }
      const { data: preview, error } = await admin.from('ai_resume_previews')
        .select('preview_data, created_at').eq('user_id', user.id).maybeSingle()
      if (error) throw error
      if (!preview) return NextResponse.json({ error: 'No draft found.' }, { status: 404 })
      if (!resumeSchema.safeParse(preview.preview_data).success) {
        return NextResponse.json({ error: 'This draft is invalid. Please generate a new draft.' }, { status: 422 })
      }
      const { error: saveError } = await admin.rpc('unlock_resume', {
        p_user_id: user.id, p_preview_created_at: body.previewCreatedAt, p_confirmed: true,
      })
      if (saveError) {
        if (saveError.code === '42501') return NextResponse.json({ error: 'Payment not recorded yet. Please retry shortly.' }, { status: 403 })
        if (saveError.code === '40001') return NextResponse.json({ error: 'The draft changed. Refresh and review it again.' }, { status: 409 })
        throw saveError
      }
      return NextResponse.json({ success: true })
    }
    if (body.mode !== 'preview') return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    const intake = intakeSchema.safeParse(body.intake)
    if (!intake.success) return NextResponse.json({ error: 'Please check your intake details.' }, { status: 400 })
    // Reserve a generation attempt atomically, including failed/truncated generations.
    const { data: allowed, error: usageError } = await admin.rpc('reserve_resume_generation', { p_user_id: user.id })
    if (usageError) throw usageError
    if (!allowed) return NextResponse.json({ error: 'Preview limit reached. Please try again in an hour.' }, { status: 429 })
    const message = await new Anthropic().messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 4000, system: RESUME_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(intake.data) }],
    })
    if (message.stop_reason !== 'end_turn') {
      return NextResponse.json({ error: 'The draft was incomplete. Please try again.' }, { status: 502 })
    }
    const raw = message.content.filter((part) => part.type === 'text').map((part) => part.text).join('')
    let parsed
    try { parsed = resumeSchema.safeParse(JSON.parse(raw)) } catch { /* handled below */ }
    if (!parsed?.success) return NextResponse.json({ error: 'Invalid draft received. Please try again.' }, { status: 502 })
    const createdAt = new Date().toISOString()
    const { error: previewError } = await admin.from('ai_resume_previews').upsert({
      user_id: user.id, preview_data: parsed.data, created_at: createdAt,
    }, { onConflict: 'user_id' })
    if (previewError) throw previewError
    return NextResponse.json({ preview: parsed.data, previewCreatedAt: createdAt })
  } catch (error) {
    console.error('[ai/resume] Request failed:', error)
    return NextResponse.json({ error: 'Resume service unavailable. Your saved resume and draft have been preserved.' }, { status: 503 })
  }
}
