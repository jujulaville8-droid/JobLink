import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessageNotification } from '@/lib/messaging-notifications'
import { sendEmail, BASE_URL } from '@/lib/email'

// POST: Employer invites a candidate to apply — creates a direct conversation
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { recipient_user_id, listing_id, body } = await request.json()

    if (!recipient_user_id || !body?.trim()) {
      return NextResponse.json({ error: 'recipient_user_id and body are required' }, { status: 400 })
    }

    if (body.trim().length > 5000) {
      return NextResponse.json({ error: 'Message too long (max 5000 characters)' }, { status: 400 })
    }

    // Verify the sender is an employer
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userData?.role !== 'employer') {
      return NextResponse.json({ error: 'Only employers can send invitations' }, { status: 403 })
    }

    // Get company info for notification
    const { data: company } = await supabase
      .from('companies')
      .select('company_name')
      .eq('user_id', user.id)
      .single()

    const companyName = company?.company_name || 'An employer'

    // Get job title for notification if listing_id provided
    let jobTitle = 'a position'
    if (listing_id) {
      const { data: listing } = await supabase
        .from('job_listings')
        .select('title')
        .eq('id', listing_id)
        .single()
      if (listing) jobTitle = listing.title
    }

    // Get recipient email for invite notification
    const { data: recipientUser } = await supabase
      .from('users')
      .select('email')
      .eq('id', recipient_user_id)
      .single()

    const recipientEmail = recipientUser?.email
    const listingUrl = listing_id ? `/jobs/${listing_id}` : null

    const admin = createAdminClient()

    // Check if a direct (non-application) conversation already exists between these two users
    const { data: existingParticipants } = await admin
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id)

    let existingConversationId: string | null = null

    if (existingParticipants && existingParticipants.length > 0) {
      const convIds = existingParticipants.map(p => p.conversation_id)

      const { data: sharedConvs } = await admin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', recipient_user_id)
        .in('conversation_id', convIds)

      if (sharedConvs && sharedConvs.length > 0) {
        const sharedConvIds = sharedConvs.map(p => p.conversation_id)
        // Only reuse a direct invite conversation, not an application thread
        const { data: directConv } = await admin
          .from('conversations')
          .select('id')
          .in('id', sharedConvIds)
          .is('application_id', null)
          .limit(1)
          .single()
        if (directConv) existingConversationId = directConv.id
      }
    }

    if (existingConversationId) {
      // Send message in existing conversation
      await admin
        .from('messages')
        .insert({ conversation_id: existingConversationId, sender_id: user.id, body: body.trim() })

      await sendMessageNotification(supabase, {
        conversationId: existingConversationId,
        recipientId: recipient_user_id,
        senderName: companyName,
        jobTitle,
        messagePreview: body.trim().slice(0, 100),
      })

      if (recipientEmail) {
        await sendEmail({
          to: recipientEmail,
          type: 'job_invite',
          data: {
            company_name: companyName,
            job_title: jobTitle,
            message_preview: body.trim().slice(0, 200),
            listing_url: listingUrl ? `${BASE_URL}${listingUrl}` : undefined,
          },
        })
      }

      return NextResponse.json({ conversation_id: existingConversationId })
    }

    // Create new conversation (direct invite — no application)
    const { data: conversation, error: convError } = await admin
      .from('conversations')
      .insert({})
      .select('id')
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: convError?.message || 'Failed to create conversation' }, { status: 500 })
    }

    // Add both participants
    const { error: partError } = await admin
      .from('conversation_participants')
      .insert([
        { conversation_id: conversation.id, user_id: user.id },
        { conversation_id: conversation.id, user_id: recipient_user_id },
      ])

    if (partError) {
      console.error('[invite] insert participants error:', partError.message)
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }

    // Send the invitation message
    await admin
      .from('messages')
      .insert({ conversation_id: conversation.id, sender_id: user.id, body: body.trim() })

    // Send notification
    await sendMessageNotification(supabase, {
      conversationId: conversation.id,
      recipientId: recipient_user_id,
      senderName: companyName,
      jobTitle,
      messagePreview: body.trim().slice(0, 100),
    })

    // Send invite email
    if (recipientEmail) {
      await sendEmail({
        to: recipientEmail,
        type: 'job_invite',
        data: {
          company_name: companyName,
          job_title: jobTitle,
          message_preview: body.trim().slice(0, 200),
          listing_url: listingUrl ? `${BASE_URL}${listingUrl}` : undefined,
        },
      })
    }

    return NextResponse.json({ conversation_id: conversation.id })
  } catch (err) {
    console.error('[invite] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
