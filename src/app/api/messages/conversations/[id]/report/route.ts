import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST: Report a conversation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { reason } = await request.json()
    if (!reason?.trim() || reason.trim().length > 1000) {
      return NextResponse.json({ error: 'A reason is required (max 1000 characters)' }, { status: 400 })
    }

    // Verify user is a participant
    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (!participant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await supabase
      .from('conversation_reports')
      .insert({
        conversation_id: conversationId,
        reported_by: user.id,
        reason: reason.trim(),
      })

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'You have already reported this conversation' }, { status: 409 })
      }
      console.error('[report] DB error:', error.message)
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
