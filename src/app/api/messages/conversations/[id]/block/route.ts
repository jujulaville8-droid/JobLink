import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST: Block the other participant in this conversation
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Block the OTHER participant (mark them as blocked so they can't send)
    const { data: otherParticipant } = await supabase
      .from('conversation_participants')
      .select('id, user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user.id)
      .single()

    if (!otherParticipant) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const { error } = await supabase
      .from('conversation_participants')
      .update({ is_blocked: true })
      .eq('id', otherParticipant.id)

    if (error) console.error('[block] DB error:', error.message)
    return NextResponse.json({ error: 'Failed to update block status' }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Unblock the other participant
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: otherParticipant } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user.id)
      .single()

    if (!otherParticipant) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const { error } = await supabase
      .from('conversation_participants')
      .update({ is_blocked: false })
      .eq('id', otherParticipant.id)

    if (error) console.error('[block] DB error:', error.message)
    return NextResponse.json({ error: 'Failed to update block status' }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
