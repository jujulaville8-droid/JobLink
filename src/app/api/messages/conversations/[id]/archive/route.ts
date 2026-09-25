import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/api-auth'

// POST: Archive a conversation (per-user)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const { error } = await supabase
      .from('conversation_participants')
      .update({ is_archived: true })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)

    if (error) {
      console.error('[archive] DB error:', error.message)
      return NextResponse.json({ error: 'Failed to update archive status' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Unarchive a conversation (per-user)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const { error } = await supabase
      .from('conversation_participants')
      .update({ is_archived: false })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)

    if (error) {
      console.error('[archive] DB error:', error.message)
      return NextResponse.json({ error: 'Failed to update archive status' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
