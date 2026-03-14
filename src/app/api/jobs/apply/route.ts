import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail, BASE_URL } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a seeker
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, is_banned')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (userData.is_banned) {
      return NextResponse.json({ error: 'Account is banned' }, { status: 403 })
    }

    if (userData.role !== 'seeker') {
      return NextResponse.json({ error: 'Only job seekers can apply' }, { status: 403 })
    }

    // Get seeker profile
    const { data: seekerProfile, error: profileError } = await supabase
      .from('seeker_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (profileError || !seekerProfile) {
      return NextResponse.json(
        { error: 'Seeker profile not found. Please complete your profile first.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { job_id, cover_letter_text } = body

    if (!job_id) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    }

    // Check the job exists and is active (include company info for emails)
    const { data: job, error: jobError } = await supabase
      .from('job_listings')
      .select('id, status, title, company_id, companies(company_name, user_id)')
      .eq('id', job_id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job listing not found' }, { status: 404 })
    }

    if (job.status !== 'active') {
      return NextResponse.json({ error: 'This job is no longer accepting applications' }, { status: 400 })
    }

    // Insert application (unique constraint on job_id + seeker_id will catch duplicates)
    const { data: application, error: insertError } = await supabase
      .from('applications')
      .insert({
        job_id,
        seeker_id: seekerProfile.id,
        cover_letter_text: cover_letter_text || '',
        status: 'applied',
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'You have already applied to this job' }, { status: 409 })
      }
      console.error('[apply] insert application error:', insertError)
      return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
    }

    // Send emails (fire-and-forget — don't block the response)
    const company = Array.isArray(job.companies) ? job.companies[0] : job.companies
    const companyName = company?.company_name || 'the company'

    // Get seeker name + CV for employer notification and auto-thread
    const { data: seekerInfo } = await supabase
      .from('seeker_profiles')
      .select('first_name, last_name, cv_url')
      .eq('id', seekerProfile.id)
      .single()

    const seekerName = seekerInfo
      ? `${seekerInfo.first_name || ''} ${seekerInfo.last_name || ''}`.trim() || 'A candidate'
      : 'A candidate'

    // ── Auto-create messaging thread ──
    let conversationId: string | null = null
    const employerUserId = company?.user_id

    if (employerUserId) {
      const messageParts: string[] = []
      messageParts.push(`Hi, I've applied for the ${job.title} position.`)

      if (cover_letter_text?.trim()) {
        messageParts.push(`\n--- Cover Letter ---\n${cover_letter_text.trim()}`)
      }

      if (seekerInfo?.cv_url) {
        messageParts.push(`\n--- Resume/CV ---\n${seekerInfo.cv_url}`)
      }

      const firstMessageBody = messageParts.join('\n')

      // Create conversation
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({ application_id: application.id })
        .select()
        .single()

      if (convError) {
        console.error('[apply] create conversation error:', convError)
      }

      if (conversation) {
        conversationId = conversation.id

        // Add both participants
        const { error: partError } = await supabase
          .from('conversation_participants')
          .insert([
            { conversation_id: conversation.id, user_id: user.id },
            { conversation_id: conversation.id, user_id: employerUserId },
          ])

        if (partError) {
          console.error('[apply] insert participants error:', partError)
        }

        // Insert the first message from the applicant
        const { error: msgError } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            sender_id: user.id,
            body: firstMessageBody,
          })

        if (msgError) {
          console.error('[apply] insert message error:', msgError)
        }
      }
    }

    // If we didn't get conversationId from the insert, try looking it up
    if (!conversationId) {
      const { data: convLookup } = await supabase
        .from('conversations')
        .select('id')
        .eq('application_id', application.id)
        .single()
      conversationId = convLookup?.id || null
    }

    // Fire-and-forget emails
    sendEmail({
      to: user.email!,
      type: 'application_confirmation',
      data: {
        job_title: job.title,
        company_name: companyName,
        dashboard_url: `${BASE_URL}/applications`,
      },
    })

    if (company?.user_id) {
      const { data: employerUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', company.user_id)
        .single()

      if (employerUser?.email) {
        sendEmail({
          to: employerUser.email,
          type: 'new_applicant',
          data: {
            applicant_name: seekerName,
            job_title: job.title,
            application_url: `${BASE_URL}/my-listings`,
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      application,
      conversation_id: conversationId,
    }, { status: 201 })
  } catch (err) {
    console.error('[apply] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
