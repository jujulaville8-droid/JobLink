import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

    const admin = createAdminClient()
    const { data: caller } = await admin
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (!caller) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    // Block the other participant after verifying the caller belongs to the thread.
    const { data: otherParticipant } = await admin
      .from('conversation_participants')
      .select('id, user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user.id)
      .single()

    if (!otherParticipant) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const { error } = await admin
      .from('conversation_participants')
      .update({ is_blocked: true })
      .eq('id', otherParticipant.id)

    if (error) {
      console.error('[block] DB error:', error.message)
      return NextResponse.json({ error: 'Failed to update block status' }, { status: 500 })
    }

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

    const admin = createAdminClient()
    const { data: caller } = await admin
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (!caller) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const { data: otherParticipant } = await admin
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user.id)
      .single()

    if (!otherParticipant) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const { error } = await admin
      .from('conversation_participants')
      .update({ is_blocked: false })
      .eq('id', otherParticipant.id)

    if (error) {
      console.error('[block] DB error:', error.message)
      return NextResponse.json({ error: 'Failed to update block status' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
