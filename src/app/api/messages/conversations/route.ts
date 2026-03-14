import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMessageNotification } from '@/lib/messaging-notifications'

// POST: Create a conversation + first message for an application
// GET: List inbox conversations (supports ?archived=true)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { application_id, body } = await request.json()
    if (!application_id || !body?.trim()) {
      return NextResponse.json({ error: 'application_id and body are required' }, { status: 400 })
    }

    if (body.trim().length > 5000) {
      return NextResponse.json({ error: 'Message too long (max 5000 characters)' }, { status: 400 })
    }

    // Fetch the application with job + company + seeker to validate ownership
    const { data: app, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        seeker_id,
        job_listings!inner (
          id, title,
          companies!inner ( id, user_id, company_name )
        ),
        seeker_profiles!inner ( user_id, first_name, last_name )
      `)
      .eq('id', application_id)
      .single()

    if (appError || !app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    const job = app.job_listings as unknown as { id: string; title: string; companies: { id: string; user_id: string; company_name: string } }
    const seeker = app.seeker_profiles as unknown as { user_id: string; first_name: string; last_name: string }
    const employerUserId = job.companies.user_id
    const seekerUserId = seeker.user_id

    // Verify the current user is either the seeker or the employer
    if (user.id !== seekerUserId && user.id !== employerUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const otherUserId = user.id === seekerUserId ? employerUserId : seekerUserId

    // Check if conversation already exists for this application
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('application_id', application_id)
      .single()

    if (existing) {
      // Conversation exists — just send a message in it
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .insert({ conversation_id: existing.id, sender_id: user.id, body: body.trim() })
        .select()
        .single()

      if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 })

      const senderName = user.id === seekerUserId
        ? `${seeker.first_name} ${seeker.last_name}`.trim()
        : job.companies.company_name
      sendMessageNotification(supabase, {
        conversationId: existing.id,
        recipientId: otherUserId,
        senderName,
        jobTitle: job.title,
        messagePreview: body.trim().slice(0, 100),
      })

      return NextResponse.json({ conversation_id: existing.id, message })
    }

    // Create new conversation using admin client to bypass RLS read-back issue
    let conversationId: string | null = null

    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const adminDb = createAdminClient()

      const { data: conversation, error: convError } = await adminDb
        .from('conversations')
        .insert({ application_id })
        .select('id')
        .single()

      if (convError || !conversation) {
        console.error('[conversations] create error:', convError)
        return NextResponse.json({ error: convError?.message || 'Failed to create conversation' }, { status: 500 })
      }

      conversationId = conversation.id

      // Add both participants
      const { error: partError } = await adminDb
        .from('conversation_participants')
        .insert([
          { conversation_id: conversation.id, user_id: user.id },
          { conversation_id: conversation.id, user_id: otherUserId },
        ])

      if (partError) {
        console.error('[conversations] insert participants error:', partError)
        return NextResponse.json({ error: partError.message }, { status: 500 })
      }

      // Insert the first message
      const { data: message, error: msgError } = await adminDb
        .from('messages')
        .insert({ conversation_id: conversation.id, sender_id: user.id, body: body.trim() })
        .select()
        .single()

      if (msgError) {
        console.error('[conversations] insert message error:', msgError)
        return NextResponse.json({ error: msgError.message }, { status: 500 })
      }

      // Send notification
      const senderName = user.id === seekerUserId
        ? `${seeker.first_name} ${seeker.last_name}`.trim()
        : job.companies.company_name
      sendMessageNotification(supabase, {
        conversationId: conversation.id,
        recipientId: otherUserId,
        senderName,
        jobTitle: job.title,
        messagePreview: body.trim().slice(0, 100),
      })

      return NextResponse.json({ conversation_id: conversation.id, message }, { status: 201 })
    } catch (adminErr) {
      // Fallback: no service key available
      console.error('[conversations] admin client unavailable:', adminErr)

      // Insert without select to avoid RLS read-back
      const { error: convError } = await supabase
        .from('conversations')
        .insert({ application_id })

      if (convError) {
        return NextResponse.json({ error: convError.message }, { status: 500 })
      }

      // Look it up now
      const { data: convLookup } = await supabase
        .from('conversations')
        .select('id')
        .eq('application_id', application_id)
        .single()

      if (!convLookup) {
        return NextResponse.json({ error: 'Conversation created but could not be retrieved' }, { status: 500 })
      }

      conversationId = convLookup.id

      await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: convLookup.id, user_id: user.id },
          { conversation_id: convLookup.id, user_id: otherUserId },
        ])

      const { data: message } = await supabase
        .from('messages')
        .insert({ conversation_id: convLookup.id, sender_id: user.id, body: body.trim() })
        .select()
        .single()

      return NextResponse.json({ conversation_id: convLookup.id, message }, { status: 201 })
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET: Inbox list using optimized RPC
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const archived = request.nextUrl.searchParams.get('archived') === 'true'

    const { data, error } = await supabase.rpc('get_inbox', {
      p_user_id: user.id,
      p_archived: archived,
    })

    if (error) {
      console.error('[inbox] RPC error:', error.message)
      return NextResponse.json([])
    }

    const inbox = (data || []).map((row: {
      conversation_id: string
      application_id: string
      last_message_text: string | null
      last_message_at: string
      last_message_sender_id: string | null
      conversation_created_at: string
      unread_count: number
      is_archived: boolean
      other_user_id: string
      other_display_name: string
      other_avatar_url: string | null
      job_title: string
      company_name: string
      application_status: string
    }) => ({
      id: row.conversation_id,
      application_id: row.application_id,
      last_message_text: row.last_message_text,
      last_message_at: row.last_message_at,
      last_message_sender_id: row.last_message_sender_id,
      created_at: row.conversation_created_at,
      unread_count: Number(row.unread_count),
      is_archived: row.is_archived,
      other_participant: {
        user_id: row.other_user_id,
        display_name: row.other_display_name || 'Unknown',
        avatar_url: row.other_avatar_url,
      },
      application_context: {
        job_title: row.job_title,
        company_name: row.company_name,
        application_status: row.application_status || 'applied',
      },
    }))

    return NextResponse.json(inbox)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
