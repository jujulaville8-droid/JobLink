import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import RunDiscoveryButton from './RunDiscoveryButton'
import SendEmailButton from './SendEmailButton'

const FROM_ADDRESS = 'JobLinks <hello@joblinkantigua.com>'
const SIGNUP_URL = 'https://joblinkantigua.com/signup?role=employer'
const CALENDLY_URL = 'https://calendly.com/joblink-anu/ecom'

function buildEmail1Html(companyName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #ffffff; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; overflow: hidden;">
    <div style="background-color: #0d7377; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">JobLinks</h1>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #374151; line-height: 1.6; font-size: 15px;">Hi there,</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">I'm reaching out to local businesses in Antigua and <strong>${companyName}</strong> stood out as a business we'd love to have on our platform.</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">We just launched <strong style="color: #0d7377;">JobLinks</strong> &mdash; Antigua &amp; Barbuda's own job platform, built specifically for local businesses like yours. Whether you're hiring now or might need someone down the road, your free employer profile puts you in front of hundreds of active job seekers across the island.</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">Here's what you get <strong>for free</strong>:</p>
      <div style="background-color: #f0fafa; border-radius: 10px; padding: 20px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #0d7377; font-size: 16px;">&check;</td><td style="padding: 8px 0; color: #374151; font-size: 14px; line-height: 1.5;">A company profile page with your logo, description, and location</td></tr>
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #0d7377; font-size: 16px;">&check;</td><td style="padding: 8px 0; color: #374151; font-size: 14px; line-height: 1.5;">Post a job listing whenever you need staff &mdash; reaches job seekers island-wide</td></tr>
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #0d7377; font-size: 16px;">&check;</td><td style="padding: 8px 0; color: #374151; font-size: 14px; line-height: 1.5;">Instant notifications when someone applies</td></tr>
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #0d7377; font-size: 16px;">&check;</td><td style="padding: 8px 0; color: #374151; font-size: 14px; line-height: 1.5;">A dashboard to review applicants, shortlist, and manage everything in one place</td></tr>
        </table>
      </div>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">It takes about 2 minutes to set up. No credit card, no commitment &mdash; and it's there for you whenever you need it.</p>
      <p style="text-align: center; margin-top: 28px;">
        <a href="${SIGNUP_URL}" style="background-color: #0d7377; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 700; display: inline-block; font-size: 15px;">Create Your Free Employer Account</a>
      </p>
      <div style="background-color: #f9fafb; border-radius: 10px; padding: 16px 20px; margin: 24px 0; text-align: center;">
        <p style="color: #374151; font-size: 14px; margin: 0 0 8px 0;"><strong>Want a quick walkthrough?</strong> Book a free 15-minute demo and we'll show you around.</p>
        <a href="${CALENDLY_URL}" style="color: #0d7377; font-size: 14px; text-decoration: none; font-weight: 600;">Book a Demo Call &rarr;</a>
      </div>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">If you have any questions, just reply to this email &mdash; I'm happy to help you get set up.</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 24px;">Wishing you all the best,<br><strong>Julian</strong><br><span style="color: #6b7280; font-size: 14px;">JobLinks Antigua</span></p>
    </div>
    <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">JobLinks &mdash; Antigua &amp; Barbuda's Job Platform</p>
      <p style="color: #9ca3af; font-size: 11px; margin-top: 4px;">Don't want emails from us? <a href="#" style="color: #9ca3af;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`
}

interface DiscoveredBusiness {
  id: string
  company_name: string
  email: string | null
  phone: string | null
  website: string | null
  sector: string | null
  location: string | null
  role_hiring_for: string | null
  source: string
  source_url: string | null
  evidence: string | null
  confidence_score: number | null
  status: 'pending_review' | 'approved' | 'rejected' | 'sent'
  notes: string | null
  discovered_at: string
  reviewed_at: string | null
  sent_at: string | null
}

// ─── Server Actions ────────────────────────────────────────────────────

async function approveBusiness(formData: FormData) {
  'use server'
  await requireRole('admin')
  const admin = createAdminClient()
  const id = formData.get('id') as string
  await admin
    .from('discovered_businesses')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/admin/discovered')
}

async function rejectBusiness(formData: FormData) {
  'use server'
  await requireRole('admin')
  const admin = createAdminClient()
  const id = formData.get('id') as string
  await admin
    .from('discovered_businesses')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/admin/discovered')
}

async function resetBusiness(formData: FormData) {
  'use server'
  await requireRole('admin')
  const admin = createAdminClient()
  const id = formData.get('id') as string
  await admin
    .from('discovered_businesses')
    .update({ status: 'pending_review', reviewed_at: null })
    .eq('id', id)
  revalidatePath('/admin/discovered')
}

async function sendEmail1ToBusiness(formData: FormData) {
  'use server'
  await requireRole('admin')
  const admin = createAdminClient()
  const id = formData.get('id') as string

  // Load the row
  const { data: biz } = await admin
    .from('discovered_businesses')
    .select('*')
    .eq('id', id)
    .single()

  if (!biz) return
  if (!biz.email) return
  if (biz.status !== 'approved') return

  const normalizedEmail = biz.email.toLowerCase().trim()

  // Dedup check — 30 day window
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: existing } = await admin
    .from('outreach_log')
    .select('id')
    .eq('email', normalizedEmail)
    .gte('contacted_at', thirtyDaysAgo.toISOString())
    .maybeSingle()

  if (existing) {
    // Already contacted recently — mark sent anyway to clear the queue
    await admin
      .from('discovered_businesses')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id)
    revalidatePath('/admin/discovered')
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[send-email-1] RESEND_API_KEY not set')
    return
  }

  const resend = new Resend(apiKey)
  const companyName = biz.company_name
  const subject = `${companyName}, something new for Antigua businesses`

  const { error: sendError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: normalizedEmail,
    subject,
    html: buildEmail1Html(companyName),
    replyTo: 'hello@joblinkantigua.com',
  })

  if (sendError) {
    console.error('[send-email-1] Resend error:', sendError.message)
    return
  }

  // Log to outreach_log so future discovery runs exclude this contact
  await admin.from('outreach_log').insert({
    business_name: companyName,
    email: normalizedEmail,
    role_hiring_for: biz.role_hiring_for,
    source_url: biz.source_url,
  })

  // Mark the row as sent
  await admin
    .from('discovered_businesses')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)

  revalidatePath('/admin/discovered')
}

// ─── Page ──────────────────────────────────────────────────────────────

export default async function AdminDiscoveredPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string }>
}) {
  await requireRole('admin')
  const params = await searchParams
  const statusFilter = params.status || 'pending_review'
  const sourceFilter = params.source || 'all'

  const admin = createAdminClient()

  let query = admin
    .from('discovered_businesses')
    .select('*')
    .order('confidence_score', { ascending: false, nullsFirst: false })
    .order('discovered_at', { ascending: false })

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }
  if (sourceFilter !== 'all') {
    query = query.eq('source', sourceFilter)
  }

  const { data: rows, error } = await query

  // Get status counts for the tab badges
  const { data: countRows } = await admin
    .from('discovered_businesses')
    .select('status')

  const statusCounts = {
    pending_review: 0,
    approved: 0,
    rejected: 0,
    sent: 0,
  }
  for (const r of countRows ?? []) {
    if (r.status in statusCounts) {
      statusCounts[r.status as keyof typeof statusCounts]++
    }
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <p className="text-red-600">Error loading queue: {error.message}</p>
      </div>
    )
  }

  const businesses = (rows || []) as DiscoveredBusiness[]

  const sourceBadgeColor: Record<string, string> = {
    google: 'bg-blue-50 text-blue-700 border-blue-200',
    facebook: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    indeed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    careers_page: 'bg-amber-50 text-amber-700 border-amber-200',
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-primary">Discovered Businesses</h1>
          <p className="text-sm text-text-muted mt-1">
            Businesses found by the discovery bot that are currently hiring in Antigua. Review and approve before outreach.
          </p>
        </div>
        <RunDiscoveryButton />
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['pending_review', 'approved', 'rejected', 'sent', 'all'] as const).map((s) => {
          const isActive = statusFilter === s
          const label = s === 'pending_review' ? 'Pending' : s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)
          const count = s === 'all' ? undefined : statusCounts[s as keyof typeof statusCounts]
          return (
            <a
              key={s}
              href={`/admin/discovered?status=${s}${sourceFilter !== 'all' ? `&source=${sourceFilter}` : ''}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                isActive
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-text-light border-border hover:border-primary/40'
              }`}
            >
              {label}
              {count !== undefined && (
                <span className={`ml-2 text-xs ${isActive ? 'text-white/80' : 'text-text-muted'}`}>{count}</span>
              )}
            </a>
          )
        })}
      </div>

      {/* Source Filter */}
      <form method="GET" className="flex gap-2 mb-6">
        <input type="hidden" name="status" value={statusFilter} />
        <select
          name="source"
          defaultValue={sourceFilter}
          className="px-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Sources</option>
          <option value="google">Google</option>
          <option value="facebook">Facebook</option>
          <option value="indeed">Indeed / Job Boards</option>
          <option value="careers_page">Careers Pages</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-light transition-colors"
        >
          Filter
        </button>
      </form>

      {/* Results */}
      {businesses.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl p-10 text-center">
          <p className="text-text-light">
            {statusFilter === 'pending_review'
              ? 'No pending businesses. Click "Run Discovery" to find more.'
              : `No businesses with status "${statusFilter}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {businesses.map((b) => (
            <div
              key={b.id}
              className="bg-white border border-border rounded-2xl p-5 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-display text-lg font-semibold text-text">{b.company_name}</h3>
                    {b.confidence_score !== null && (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          b.confidence_score >= 8
                            ? 'bg-emerald-50 text-emerald-700'
                            : b.confidence_score >= 6
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        Score {b.confidence_score}/10
                      </span>
                    )}
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${
                        sourceBadgeColor[b.source] || 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}
                    >
                      {b.source}
                    </span>
                  </div>
                  {b.role_hiring_for && (
                    <p className="text-sm text-primary font-medium mb-2">
                      Hiring: {b.role_hiring_for}
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-text-light mb-2">
                    {b.sector && <div><span className="text-text-muted">Sector:</span> {b.sector}</div>}
                    {b.location && <div><span className="text-text-muted">Location:</span> {b.location}</div>}
                    {b.email && (
                      <div>
                        <span className="text-text-muted">Email:</span>{' '}
                        <a href={`mailto:${b.email}`} className="text-primary hover:underline">
                          {b.email}
                        </a>
                      </div>
                    )}
                    {b.phone && (
                      <div>
                        <span className="text-text-muted">Phone:</span> {b.phone}
                      </div>
                    )}
                    {b.website && (
                      <div className="truncate">
                        <span className="text-text-muted">Website:</span>{' '}
                        <a href={b.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {b.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      </div>
                    )}
                    {b.source_url && (
                      <div className="truncate">
                        <span className="text-text-muted">Source:</span>{' '}
                        <a href={b.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          View listing
                        </a>
                      </div>
                    )}
                  </div>
                  {b.evidence && (
                    <div className="text-xs bg-bg-alt border-l-2 border-primary/30 px-3 py-2 rounded mt-2">
                      <span className="text-text-muted">Evidence:</span> &ldquo;{b.evidence}&rdquo;
                    </div>
                  )}
                </div>
                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  {b.status === 'pending_review' ? (
                    <>
                      <form action={approveBusiness}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                        >
                          Approve
                        </button>
                      </form>
                      <form action={rejectBusiness}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="w-full px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
                        >
                          Reject
                        </button>
                      </form>
                    </>
                  ) : b.status === 'approved' ? (
                    <>
                      <SendEmailButton
                        id={b.id}
                        email={b.email}
                        companyName={b.company_name}
                        action={sendEmail1ToBusiness}
                      />
                      <form action={resetBusiness}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="w-full px-3 py-1.5 bg-white border border-border text-text-light rounded-lg text-xs hover:border-primary/40 transition-colors"
                        >
                          Reset to Pending
                        </button>
                      </form>
                    </>
                  ) : (
                    <>
                      <div
                        className={`text-center px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          b.status === 'sent'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {b.status === 'sent' ? 'Sent' : 'Rejected'}
                      </div>
                      {b.sent_at && (
                        <div className="text-center text-[10px] text-text-muted">
                          {new Date(b.sent_at).toLocaleDateString()}
                        </div>
                      )}
                      <form action={resetBusiness}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="w-full px-3 py-1.5 bg-white border border-border text-text-light rounded-lg text-xs hover:border-primary/40 transition-colors"
                        >
                          Reset to Pending
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
