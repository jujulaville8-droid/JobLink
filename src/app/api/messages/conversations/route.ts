import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

// POST: Create a conversation + first message for an application
// GET: List inbox conversations with unread counts
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

      return NextResponse.json({ conversation_id: existing.id, message })
    }

    // Create new conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({ application_id })
      .select()
      .single()

    if (convError) return NextResponse.json({ error: convError.message }, { status: 500 })

    // Add both participants
    const { error: partError } = await supabase
      .from('conversation_participants')
      .insert([
        { conversation_id: conversation.id, user_id: user.id },
        { conversation_id: conversation.id, user_id: otherUserId },
      ])

    if (partError) return NextResponse.json({ error: partError.message }, { status: 500 })

    // Insert the first message
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversation.id, sender_id: user.id, body: body.trim() })
      .select()
      .single()

    if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 })

    // Send email notification to the other party (fire-and-forget)
    const { data: otherUser } = await supabase
      .from('users')
      .select('email')
      .eq('id', otherUserId)
      .single()

    if (otherUser?.email) {
      const senderName = user.id === seekerUserId
        ? `${seeker.first_name} ${seeker.last_name}`.trim()
        : job.companies.company_name

      sendEmail({
        to: otherUser.email,
        type: 'new_message',
        data: {
          sender_name: senderName,
          job_title: job.title,
          message_preview: body.trim().slice(0, 100),
        },
      })
    }

    return NextResponse.json({ conversation_id: conversation.id, message }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET: Inbox list
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get all conversations the user participates in
    const { data: participations, error } = await supabase
      .from('conversation_participants')
      .select(`
        last_read_at,
        conversations!inner (
          id,
          application_id,
          last_message_text,
          last_message_at,
          last_message_sender_id,
          created_at
        )
      `)
      .eq('user_id', user.id)
      .not('conversations.last_message_at', 'is', null)
      .order('conversations(last_message_at)', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!participations || participations.length === 0) {
      return NextResponse.json([])
    }

    // Build inbox with unread counts and other participant info
    const inbox = []
    for (const p of participations) {
      const conv = p.conversations as unknown as {
        id: string; application_id: string; last_message_text: string | null;
        last_message_at: string; last_message_sender_id: string | null; created_at: string;
      }

      // Get unread count
      const { count: unreadCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .gt('created_at', p.last_read_at)
        .neq('sender_id', user.id)

      // Get the other participant's info
      const { data: otherPart } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conv.id)
        .neq('user_id', user.id)
        .single()

      let otherParticipant = { user_id: '', display_name: 'Unknown', avatar_url: null as string | null }
      if (otherPart) {
        // Try seeker profile first
        const { data: seekerProfile } = await supabase
          .from('seeker_profiles')
          .select('first_name, last_name, avatar_url')
          .eq('user_id', otherPart.user_id)
          .single()

        if (seekerProfile) {
          otherParticipant = {
            user_id: otherPart.user_id,
            display_name: `${seekerProfile.first_name || ''} ${seekerProfile.last_name || ''}`.trim() || 'Job Seeker',
            avatar_url: seekerProfile.avatar_url,
          }
        } else {
          // Try company
          const { data: companyProfile } = await supabase
            .from('companies')
            .select('company_name, logo_url')
            .eq('user_id', otherPart.user_id)
            .single()

          if (companyProfile) {
            otherParticipant = {
              user_id: otherPart.user_id,
              display_name: companyProfile.company_name || 'Employer',
              avatar_url: companyProfile.logo_url,
            }
          }
        }
      }

      // Get application context (job title + company)
      const { data: appData } = await supabase
        .from('applications')
        .select('job_listings!inner ( title, companies!inner ( company_name ) )')
        .eq('id', conv.application_id)
        .single()

      const jobInfo = appData?.job_listings as unknown as { title: string; companies: { company_name: string } } | null

      inbox.push({
        ...conv,
        unread_count: unreadCount || 0,
        other_participant: otherParticipant,
        application_context: {
          job_title: jobInfo?.title || 'Unknown Position',
          company_name: jobInfo?.companies?.company_name || 'Unknown Company',
        },
      })
    }

    return NextResponse.json(inbox)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
