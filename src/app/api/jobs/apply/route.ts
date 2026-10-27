import { cvExtension } from '@/lib/cv-upload'
import { getJobClosure } from '@/lib/job-closures'
import { after, NextRequest, NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/api-auth'
import { sendEmail, BASE_URL } from '@/lib/email'
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit'
import { applicantCvPath, notifyNewApplicant } from '@/lib/applicant-notifications'
import { applicationDependencies, screeningApplicationEnabled, ScreeningSubmissionError, submitScreeningApplication } from '@/lib/employer-screening/application'
import { hasCurrentScreeningNotice } from '@/lib/employer-screening/notice'
import { inlineDiagnostic } from '@/lib/employer-screening/inline-diagnostics'

// Deployment must support after() and this timeout before any readiness gates are enabled.
export const maxDuration = 180

export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const limited = await enforceRateLimit(`apply:${user.id}`, RateLimits.apply)
    if (limited) return limited

    // Verify user is a seeker
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
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

    // Check the job exists and is active
    const { data: job, error: jobError } = await supabase
      .from('job_listings')
      .select('id, status, title, company_id, posted_by_admin, companies(company_name, user_id, contact_email)')
      .eq('id', job_id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job listing not found' }, { status: 404 })
    }

    if (job.status !== 'active' || getJobClosure(job.id, job.company_id)) {
      return NextResponse.json({ error: 'This job is no longer accepting applications' }, { status: 400 })
    }

    // Prevent applying to your own company's listing
    const jobCompany = Array.isArray(job.companies) ? job.companies[0] : job.companies
    if (jobCompany?.user_id === user.id) {
      return NextResponse.json({ error: 'You cannot apply to your own job listing' }, { status: 403 })
    }

    // OFF preserves the existing insert and forwarding flow. Once the atomic RPC
    // chooses screening, no later flag, error, timeout or rollback may select legacy.
    let application: { id: string; [key: string]: unknown }
    let deliveryPath: 'legacy' | 'screening' = 'legacy'
    // Stale clients or undisclosed submissions retain ordinary forwarding, with
    // no AI/private capture. This attests displayed notice version, not consent.
    if (screeningApplicationEnabled() && hasCurrentScreeningNotice(body.screening_notice_version)) {
      if (typeof job_id !== 'string' || (cover_letter_text !== undefined && typeof cover_letter_text !== 'string')) {
        return NextResponse.json({ error: 'Invalid application' }, { status: 400 })
      }
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const saved = await submitScreeningApplication({
          jobId: job_id, applicantUserId: user.id, seekerId: seekerProfile.id,
          coverLetter: cover_letter_text || '',
        }, applicationDependencies(createAdminClient()))
        application = saved.application
        deliveryPath = saved.deliveryPath
      } catch (error) {
        if (error instanceof ScreeningSubmissionError && error.duplicate) {
          return NextResponse.json({ error: 'You have already applied to this job' }, { status: 409 })
        }
        console.error('[apply] Atomic application submission unavailable')
        return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
      }
    } else {
      const { data: saved, error: insertError } = await supabase
        .from('applications')
        .insert({ job_id, seeker_id: seekerProfile.id, cover_letter_text: cover_letter_text || '', status: 'applied' })
        .select()
        .single()
      if (insertError) {
        if (insertError.code === '23505') {
          return NextResponse.json({ error: 'You have already applied to this job' }, { status: 409 })
        }
        console.error('[apply] Failed to save application')
        return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
      }
      application = saved
    }

    if (deliveryPath === 'screening' && process.env.EMPLOYER_OUTBOX_WORKER_ENABLED === 'true') {
      try {
        after(async () => {
          try {
            const { runEmployerScreeningWorker } = await import('@/lib/employer-screening/worker')
            await runEmployerScreeningWorker()
          } catch { console.warn('[apply] Background forwarding deferred to durable watchdog') }
        })
      } catch { console.warn('[apply] Background forwarding deferred to durable watchdog') }
    }

    const company = Array.isArray(job.companies) ? job.companies[0] : job.companies
    const companyName = company?.company_name || 'the company'

    // Preserve the ordinary participant-authorized chat link on both paths. This
    // current uploaded CV is not the immutable screening/email capture and never
    // replaces its bytes or evidence. Private captures must not enter chat.
    const seekerInfo = (await supabase
      .from('seeker_profiles')
      .select('first_name, last_name, cv_url')
      .eq('id', seekerProfile.id)
      .eq('user_id', user.id)
      .single()).data

    // ── Auto-create messaging thread ──
    // Use admin client to bypass RLS since we've already verified authorization.
    // RLS blocks the read-back on .select() because the user isn't a participant yet
    // at the moment the conversation row is created.
    let conversationId: string | null = null

    // For admin-posted jobs, route messages to the admin user instead of the placeholder
    let employerUserId = company?.user_id
    if (job.posted_by_admin) {
      const { createAdminClient: getAdmin } = await import('@/lib/supabase/admin')
      const adminCheck = getAdmin()
      const { data: adminUser } = await adminCheck
        .from('users')
        .select('id')
        .eq('is_admin', true)
        .limit(1)
        .single()
      if (adminUser) {
        employerUserId = adminUser.id
      }
    }

    if (employerUserId) {
      try {
        // Try admin client first (bypasses RLS)
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const adminDb = createAdminClient()

        const messageParts: string[] = []
        messageParts.push(`Hi, I've applied for the ${job.title} position.`)
        if (cover_letter_text?.trim()) {
          messageParts.push(`\n\n📝 Cover Letter\n${cover_letter_text.trim()}`)
        }
        const firstMessageBody = messageParts.join('\n')

        // Build CV attachment info if available
        const cvAttachmentUrl = deliveryPath === 'screening'
          ? applicantCvPath(seekerInfo?.cv_url, user.id)
          : seekerInfo?.cv_url || null
        const cvAttachmentName = cvAttachmentUrl
          ? `${(seekerInfo?.first_name || 'Applicant')}_${(seekerInfo?.last_name || '')}_CV.${cvExtension(seekerInfo?.cv_url || '') || 'pdf'}`.replace(/\s+/g, '_')
          : null

        // Create conversation
        const { data: conversation, error: convError } = await adminDb
          .from('conversations')
          .insert({ application_id: application.id })
          .select('id')
          .single()

        if (convError) {
          console.error('[apply] Failed to create application conversation')
        }

        if (conversation) {
          conversationId = conversation.id

          // Add both participants
          const { error: partError } = await adminDb
            .from('conversation_participants')
            .insert([
              { conversation_id: conversation.id, user_id: user.id },
              { conversation_id: conversation.id, user_id: employerUserId },
            ])

          if (partError) {
            console.error('[apply] Failed to add application conversation participants')
          }

          // Insert the first message with CV as attachment
          const { error: msgError } = await adminDb
            .from('messages')
            .insert({
              conversation_id: conversation.id,
              sender_id: user.id,
              body: firstMessageBody,
              ...(cvAttachmentUrl ? { attachment_url: cvAttachmentUrl, attachment_name: cvAttachmentName } : {}),
            })

          if (msgError) {
            console.error('[apply] Failed to save application message')
          }
        }
      } catch {
        console.error('[apply] Application conversation unavailable')
      }
    }

    // Send confirmation + new-applicant emails
    await sendEmail({
      to: user.email!,
      type: 'application_confirmation',
      data: {
        job_title: job.title,
        company_name: companyName,
        dashboard_url: `${BASE_URL}/applications`,
      },
    })

    if (deliveryPath === 'legacy') {
      // Capture the actual request attestation before returning. Neither a stale
      // client nor a later flag change may invent a notice for this application.
      const noticeVersion = process.env.EMPLOYER_SCREENING_INLINE_ENABLED === 'true' &&
        hasCurrentScreeningNotice(body.screening_notice_version) ? body.screening_notice_version : undefined
      const applicationId = application.id
      inlineDiagnostic(process.env.EMPLOYER_SCREENING_INLINE_ENABLED !== 'true' ? 'route_inline_disabled' :
        noticeVersion === undefined ? 'route_notice_missing' : 'route_notice_current', applicationId)
      const applicantUserId = user.id
      let forwardingStarted = false
      const forwardEmployer = async () => {
        // Also fences a scheduler that registers work before throwing. Never
        // automatically replay an uncertain provider send or change its key.
        if (forwardingStarted) return
        forwardingStarted = true
        try {
          if (noticeVersion !== undefined) await notifyNewApplicant(applicationId, applicantUserId, noticeVersion)
          else await notifyNewApplicant(applicationId, applicantUserId)
        } catch { console.warn('[apply] Employer notification unavailable') }
      }
      try {
        // Chat and applicant receipt above retain their original semantics.
        // Only employer forwarding moves after the response; optional review
        // remains bounded inside the notifier. This is not a durable queue.
        after(forwardEmployer)
      } catch {
        // Unsupported scheduling falls back to the original awaited path once.
        console.warn('[apply] Employer notification running inline')
        await forwardEmployer()
      }
    }

    return NextResponse.json({
      success: true,
      application,
      conversation_id: conversationId,
    }, { status: 201 })
  } catch {
    // Database/provider errors may include cover letters, contact data or CV paths.
    console.error('[apply] Application request failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
