const STATUS_MESSAGES: Record<string, string> = {
  interview: 'Great news! The employer would like to move forward with an interview.',
  rejected: 'Thank you for your interest. The employer has decided to move forward with other candidates for this position.',
  hold: 'Your application has been placed on hold. The employer may follow up with next steps.',
}

/**
 * Sends a system-style message into the conversation thread
 * when an application status changes. Uses admin client to bypass RLS.
 */
export async function sendStatusChangeMessage(
  _supabase: unknown,
  params: {
    applicationId: string
    employerUserId: string
    seekerUserId: string
    newStatus: string
    jobTitle: string
    companyName: string
    customMessage?: string
  }
): Promise<void> {
  const { applicationId, employerUserId, seekerUserId, newStatus, jobTitle, companyName, customMessage } = params

  const statusMessage = customMessage || STATUS_MESSAGES[newStatus]
  if (!statusMessage) return

  const fullMessage = `--- Application Update ---\n${statusMessage}\n\nPosition: ${jobTitle}\nCompany: ${companyName}`

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()

    // Find existing conversation for this application
    let conversationId: string | null = null

    const { data: existing } = await adminDb
      .from('conversations')
      .select('id')
      .eq('application_id', applicationId)
      .single()

    if (existing) {
      conversationId = existing.id
    } else {
      // Create conversation if one doesn't exist yet
      const { data: newConv } = await adminDb
        .from('conversations')
        .insert({ application_id: applicationId })
        .select('id')
        .single()

      if (newConv) {
        conversationId = newConv.id

        // Add both participants
        await adminDb
          .from('conversation_participants')
          .insert([
            { conversation_id: newConv.id, user_id: employerUserId },
            { conversation_id: newConv.id, user_id: seekerUserId },
          ])
      }
    }

    if (!conversationId) return

    // Insert the status update message as the employer
    await adminDb
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
