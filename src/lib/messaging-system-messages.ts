import type { SupabaseClient } from '@supabase/supabase-js'

const STATUS_MESSAGES: Record<string, string> = {
  shortlisted: '🟢 Your application has been shortlisted. The employer is interested in moving forward.',
  rejected: 'Thank you for your interest. The employer has decided to move forward with other candidates for this position.',
  hired: '🎉 Congratulations! You have been hired for this position. The employer will follow up with next steps.',
}

/**
 * Sends a system-style message into the conversation thread
 * when an application status changes. The message is sent
 * as the employer (since they're the one changing the status).
 *
 * If no conversation exists for the application, one is created.
 */
export async function sendStatusChangeMessage(
  supabase: SupabaseClient,
  params: {
    applicationId: string
    employerUserId: string
    seekerUserId: string
    newStatus: string
    jobTitle: string
    companyName: string
  }
): Promise<void> {
  const { applicationId, employerUserId, seekerUserId, newStatus, jobTitle, companyName } = params

  const statusMessage = STATUS_MESSAGES[newStatus]
  if (!statusMessage) return

  const fullMessage = `--- Application Update ---\n${statusMessage}\n\nPosition: ${jobTitle}\nCompany: ${companyName}`

  try {
    // Find existing conversation for this application
    let conversationId: string | null = null

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('application_id', applicationId)
      .single()

    if (existing) {
      conversationId = existing.id
    } else {
      // Create conversation if one doesn't exist yet
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ application_id: applicationId })
        .select()
        .single()

      if (newConv) {
        conversationId = newConv.id

        // Add both participants
        await supabase
          .from('conversation_participants')
          .insert([
            { conversation_id: newConv.id, user_id: employerUserId },
            { conversation_id: newConv.id, user_id: seekerUserId },
          ])
      }
    }

    if (!conversationId) return

    // Insert the status update message as the employer
    await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: employerUserId,
        body: fullMessage,
      })
  } catch (err) {
    console.error('[sendStatusChangeMessage] error:', err)
  }
}
