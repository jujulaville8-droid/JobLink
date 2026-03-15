import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMessageNotification } from '@/lib/messaging-notifications'

// GET: Paginated messages for a conversation (supports cursor-based loading)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify user is a participant
    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('id, is_blocked')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (!participant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(request.url)
    const before = url.searchParams.get('before') // cursor: load messages before this timestamp
    const pageSize = 50

    let query = supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, attachment_url, attachment_name, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(pageSize)

    if (before) {
      query = query.lt('created_at', before)
    }

    const { data: messages, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Reverse to ascending order for display
    const sorted = (messages || []).reverse()

    return NextResponse.json({
      messages: sorted,
      has_more: (messages?.length || 0) === pageSize,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { body } = await request.json()
    if (!body?.trim()) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }
    if (body.trim().length > 5000) {
      return NextResponse.json({ error: 'Message too long (max 5000 characters)' }, { status: 400 })
    }

    // Verify user is a participant and not blocked
    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('id, is_blocked')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (!participant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (participant.is_blocked) return NextResponse.json({ error: 'You are blocked from this conversation' }, { status: 403 })

    // Dialogue gating: seekers can't send more messages until the employer replies
    const { data: convMeta } = await supabase.rpc('get_conversation_meta', {
      p_user_id: user.id,
      p_conversation_id: conversationId,
    })
    const meta = convMeta?.[0]
    if (meta && user.id === meta.seeker_user_id && !meta.dialogue_open) {
      return NextResponse.json(
        { error: 'Please wait for the employer to respond before sending another message.' },
        { status: 403 }
      )
    }

    // Rejection gating: seekers can't send messages after being rejected
    if (meta && user.id === meta.seeker_user_id) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('application_id')
        .eq('id', conversationId)
        .single()
      if (conv?.application_id) {
        const { data: application } = await supabase
          .from('applications')
          .select('status')
          .eq('id', conv.application_id)
          .single()
        if (application?.status === 'rejected') {
          return NextResponse.json(
            { error: 'You can no longer send messages for this application.' },
            { status: 403 }
          )
        }
      }
    }

    // Insert message (trigger auto-updates conversation.last_message_*)
    const { data: message, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: user.id, body: body.trim() })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Send notification to other participant (fire-and-forget)
    const { data: otherPart } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user.id)
      .single()

    if (otherPart) {
      // Get sender name and job context for notification
      const { data: convMeta } = await supabase.rpc('get_conversation_meta', {
        p_user_id: otherPart.user_id,
        p_conversation_id: conversationId,
      })

      const meta = convMeta?.[0]
      if (meta) {
        sendMessageNotification(supabase, {
          conversationId,
          recipientId: otherPart.user_id,
          senderName: meta.other_display_name || 'Someone',
          jobTitle: meta.job_title || 'a position',
          messagePreview: body.trim().slice(0, 100),
        })
      }
    }

    return NextResponse.json(message, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
