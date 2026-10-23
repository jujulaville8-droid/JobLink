// @vitest-environment node
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { captureBaseline, readSnapshot } from '../src/lib/employer-screening'
import { screeningApplicationEnabled, screeningRubricApprovalEnabled, SCREENING_APPLICATION_GATES,
  submitScreeningApplication, ScreeningSubmissionError, type ApplicationDependencies } from '../src/lib/employer-screening/application'
import type { CapturedResume } from '../src/lib/employer-screening/capture'
import { SCREENING_NOTICE_VERSION } from '../src/lib/employer-screening/notice'

const USER = '11111111-1111-4111-8111-111111111111', SEEKER = '22222222-2222-4222-8222-222222222222'
const JOB = '33333333-3333-4333-8333-333333333333', APP = '44444444-4444-4444-8444-444444444444'
const COMPANY = '55555555-5555-4555-8555-555555555555', OWNER = '66666666-6666-4666-8666-666666666666'
const VERSION = '77777777-7777-4777-8777-777777777777'
const CRITERIA = [{ id: 'skill', label: 'Spreadsheet skills', category: 'skill' as const, weight: 100, verificationRequired: false }]
const HASH = createHash('sha256').update('%PDF-synthetic Excel').digest('hex')
const captured = (): CapturedResume => ({ versionId: VERSION, sha256: HASH,
  attachment: { storagePath: `${USER}/${APP}/${VERSION}.pdf`, filename: 'Synthetic_CV.pdf', bytes: 20, sha256: HASH },
  extraction: { sourceSha256: HASH, evidence: [{ id: 'skill_1', category: 'skill', excerpt: 'Microsoft Excel', location: 'builder.skills[0]' }] },
})
function saved(applicationId = APP, capture: CapturedResume | null = captured(), path: 'legacy' | 'screening' = 'screening') {
  const baseline = captureBaseline({ applicationId, jobId: JOB, companyId: COMPANY, createdAt: 1000,
    from: 'JobLink <notifications@joblinkantigua.com>', to: 'employer@example.invalid', replyTo: 'applicant@example.invalid',
    applicantName: 'Synthetic applicant', applicantEmail: 'applicant@example.invalid', applicantPhone: null,
    jobTitle: 'Synthetic role', companyName: 'Synthetic company', coverLetterExcerpt: '', reviewPath: null,
    resumeVersionId: capture?.versionId ?? null, resumeSha256: capture?.sha256 ?? null, attachments: capture ? [capture.attachment] : [],
  })
  return { application: { id: applicationId, job_id: JOB, seeker_id: SEEKER, status: 'applied' }, employer_delivery_path: path,
    baseline_json: baseline.json, baseline_sha256: baseline.sha256,
    rubric_json: { versionId: 'rubric-v1', jobId: JOB, approved: true, criteria: CRITERIA }, rubric_version_id: 'rubric-v1' }
}
function dependencies() {
  const response = saved()
  const rpc = vi.fn().mockImplementation(async (name: string) => ({ data: name === 'employer_screening_configuration' ? { enabled: true }
    : name === 'employer_screening_apply' ? response : true, error: null }))
  const capture = vi.fn().mockResolvedValue(captured())
  return { deps: { db: { rpc }, capture, uuid: () => APP } as ApplicationDependencies, rpc, capture, response }
}
const input = { jobId: JOB, applicantUserId: USER, seekerId: SEEKER, coverLetter: 'Synthetic letter' }

describe('default-off atomic application integration', () => {
  it('requires every explicit activation prerequisite; a single flag and truthy strings are insufficient', () => {
    expect(screeningApplicationEnabled({})).toBe(false)
    expect(screeningApplicationEnabled({ EMPLOYER_SCREENING_ENABLED: 'true' })).toBe(false)
    const flags = Object.fromEntries(SCREENING_APPLICATION_GATES.map(key => [key, 'true']))
    expect(screeningApplicationEnabled(flags)).toBe(true)
    for (const key of SCREENING_APPLICATION_GATES) expect(screeningApplicationEnabled({ ...flags, [key]: 'false' })).toBe(false)
    expect(screeningApplicationEnabled({ ...flags, EMPLOYER_SCREENING_ENABLED: '1' })).toBe(false)
    expect(screeningRubricApprovalEnabled({ EMPLOYER_SCREENING_RUBRIC_APPROVAL_ENABLED: 'true' })).toBe(false)
  })
  it('submits immutable materials once then registers exact source/rubric-bound enrichment', async () => {
    const { deps, rpc, capture } = dependencies()
    expect(await submitScreeningApplication(input, deps)).toMatchObject({ deliveryPath: 'screening', application: { id: APP, status: 'applied' } })
    expect(capture).toHaveBeenCalledExactlyOnceWith(APP, USER)
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['employer_screening_configuration', 'employer_screening_apply', 'employer_screening_register_materials'])
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_application_id: APP, p_job_id: JOB, p_applicant_user_id: USER,
      p_resume_version_id: VERSION, p_resume_sha256: HASH, p_attachment: captured().attachment })
    const params = rpc.mock.calls[2][1]
    expect(readSnapshot({ json: params.p_snapshot_json, sha256: params.p_snapshot_sha256 })).toMatchObject({ createdAt: 1000,
      applicationId: APP, resume: { sha256: HASH }, rubric: { versionId: 'rubric-v1', jobId: JOB } })
  })
  it('uses only the persisted legacy choice when database gate is off, without private capture', async () => {
    const { deps, rpc, capture, response } = dependencies(); response.employer_delivery_path = 'legacy'
    rpc.mockImplementation(async (name: string) => ({ data: name === 'employer_screening_configuration' ? { enabled: false } : response, error: null }))
    expect((await submitScreeningApplication(input, deps)).deliveryPath).toBe('legacy')
    expect(capture).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_attachment: null, p_resume_version_id: null, p_resume_sha256: null })
  })
  it('queues the original baseline after capture failure or missing CV, without inventing 0/evidence', async () => {
    const { deps, capture, rpc } = dependencies(); capture.mockRejectedValue(new Error('storage unavailable'))
    expect((await submitScreeningApplication(input, deps)).deliveryPath).toBe('screening')
    expect(rpc).toHaveBeenCalledTimes(3); expect(rpc.mock.calls[1][1].p_attachment).toBeNull()
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_snapshot_json: null, p_snapshot_sha256: null })
  })
  it.each(['absent-rubric', 'unapproved-rubric', 'corrupt-baseline', 'wrong-rubric-version', 'unavailable-extraction', 'cross-source-evidence', 'cross-tenant-capture', 'unsupported-rubric'])('keeps the queued baseline after %s', async scenario => {
    const { deps, rpc, capture, response } = dependencies()
    if (scenario === 'absent-rubric') response.rubric_json = null as never
    if (scenario === 'unapproved-rubric') response.rubric_json.approved = false
    if (scenario === 'corrupt-baseline') response.baseline_sha256 = 'f'.repeat(64)
    if (scenario === 'wrong-rubric-version') response.rubric_version_id = 'other-version'
    if (scenario === 'unavailable-extraction') capture.mockResolvedValue({ ...captured(), extraction: null })
    if (scenario === 'cross-source-evidence') capture.mockResolvedValue({ ...captured(), extraction: { ...captured().extraction, sourceSha256: 'e'.repeat(64) } })
    if (scenario === 'cross-tenant-capture') capture.mockResolvedValue({ ...captured(), attachment: { ...captured().attachment, storagePath: 'other-user/private.pdf' } })
    if (scenario === 'unsupported-rubric') response.rubric_json.criteria = [{ ...CRITERIA[0], label: 'Young unmarried applicants' }]
    expect((await submitScreeningApplication(input, deps)).deliveryPath).toBe('screening')
    expect(rpc).toHaveBeenCalledTimes(3)
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_snapshot_json: null, p_snapshot_sha256: null })
  })
  it('registration failure cannot fall back to a second legacy insertion or change selected path', async () => {
    const { deps, rpc, response } = dependencies()
    rpc.mockImplementation(async (name: string) => {
      if (name === 'employer_screening_register_materials') throw new Error('uncertain registration')
      return { data: name === 'employer_screening_configuration' ? { enabled: true } : response, error: null }
    })
    expect((await submitScreeningApplication(input, deps)).deliveryPath).toBe('screening')
    expect(rpc.mock.calls.filter(([name]) => name === 'employer_screening_apply')).toHaveLength(1)
  })
  it('bounds optional registration without undoing the durable baseline when the RPC hangs', async () => {
    vi.useFakeTimers()
    try {
      const { deps, rpc, response } = dependencies()
      rpc.mockImplementation(async (name: string) => name === 'employer_screening_register_materials' ? await new Promise(() => {})
        : { data: name === 'employer_screening_configuration' ? { enabled: true } : response, error: null })
      const pending = submitScreeningApplication(input, deps)
      await vi.advanceTimersByTimeAsync(2_001)
      expect((await pending).deliveryPath).toBe('screening')
      expect(rpc.mock.calls.filter(([name]) => name === 'employer_screening_apply')).toHaveLength(1)
    } finally { vi.useRealTimers() }
  })
  it.each(['rpc-error', 'uncertain-result', 'wrong-application'])('never performs fallback after %s', async scenario => {
    const { deps, rpc, response } = dependencies()
    if (scenario === 'wrong-application') response.application.id = OWNER
    rpc.mockImplementation(async (name: string) => {
      if (name === 'employer_screening_configuration') return { data: { enabled: true }, error: null }
      if (scenario === 'uncertain-result') throw new Error('transport timeout')
      return scenario === 'rpc-error' ? { data: null, error: { code: 'OTHER' } } : { data: response, error: null }
    })
    await expect(submitScreeningApplication(input, deps)).rejects.toThrow()
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('recognizes only a known duplicate as duplicate and exposes no database private message', async () => {
    const { deps, rpc } = dependencies()
    rpc.mockImplementation(async (name: string) => name === 'employer_screening_configuration' ? { data: { enabled: true }, error: null }
      : { data: null, error: { code: '23505', message: 'Private applicant details' } })
    await expect(submitScreeningApplication(input, deps)).rejects.toEqual(new ScreeningSubmissionError(true))
  })
})

const routeState = vi.hoisted(() => ({ role: 'seeker', userId: '', companyOwner: '', authStatus: 0, path: 'screening',
  rpcError: false, approvalError: false, cvUrl: null as string | null, messages: [] as Record<string, unknown>[], after: vi.fn(), worker: vi.fn(), inserts: [] as string[], rpc: vi.fn(), email: vi.fn(), notify: vi.fn() }))
function routeDb(admin = false) {
  return {
    rpc: routeState.rpc,
    from(table: string) {
      let payload: Record<string, unknown> = {}
      const run = () => {
        if (table === 'users') return { data: { id: routeState.userId, role: routeState.role }, error: null }
        if (table === 'seeker_profiles') return { data: { id: SEEKER, cv_url: routeState.cvUrl, first_name: 'Synthetic', last_name: 'Applicant' }, error: null }
        if (table === 'cv_profiles') return { data: null, error: null }
        if (table === 'job_listings') return { data: { id: JOB, status: 'active', title: 'Synthetic role', company_id: COMPANY,
          posted_by_admin: false, companies: { company_name: 'Synthetic Company', user_id: routeState.companyOwner } }, error: null }
        routeState.inserts.push(table)
        if (table === 'messages') routeState.messages.push(payload)
        return { data: table === 'applications' ? { ...payload, id: APP } : table === 'conversations' ? { id: APP } : null, error: null }
      }
      const query = { select: () => query, eq: () => query, limit: () => query,
        insert: (value: Record<string, unknown>) => { payload = value; return query },
        single: async () => run(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve) }
      void admin
      return query
    },
  }
}
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<object>(), after: routeState.after }))
vi.mock('@/lib/employer-screening/worker', () => ({ runEmployerScreeningWorker: routeState.worker }))
vi.mock('@/lib/api-auth', () => ({ requireVerifiedUser: async () => routeState.authStatus
  ? { error: NextResponse.json({ error: 'Auth required' }, { status: routeState.authStatus }) }
  : { user: { id: routeState.userId, email: 'synthetic@example.invalid' }, supabase: routeDb(), isAdmin: false } }))
vi.mock('@/lib/employer-screening/capture-read', async importOriginal => ({ ...await importOriginal<object>(), createBoundedCaptureReadClient: () => routeDb() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => routeDb(true) }))
vi.mock('@/lib/email', () => ({ sendEmail: routeState.email, BASE_URL: 'https://joblinkantigua.com' }))
vi.mock('@/lib/applicant-notifications', async importOriginal => ({ ...await importOriginal<object>(), notifyNewApplicant: routeState.notify }))
vi.mock('@/lib/rate-limit', () => ({ RateLimits: { apply: {} }, enforceRateLimit: async () => null }))
import { POST as applyRoute } from '../src/app/api/jobs/apply/route'
import { POST as approveRoute } from '../src/app/api/jobs/[id]/screening-rubric/route'
const apply = (noticeVersion: unknown = SCREENING_NOTICE_VERSION) => applyRoute(new NextRequest('https://joblinkantigua.com/api/jobs/apply', {
  method: 'POST', body: JSON.stringify({ job_id: JOB, cover_letter_text: 'Synthetic letter', screening_notice_version: noticeVersion }),
}))
const approve = (body: unknown = { approve: true, expectedVersion: null, criteria: CRITERIA }, origin?: string) => approveRoute(
  new NextRequest(`https://joblinkantigua.com/api/jobs/${JOB}/screening-rubric`, { method: 'POST', body: JSON.stringify(body), headers: origin ? { origin } : {} }),
  { params: Promise.resolve({ id: JOB }) },
)
beforeEach(() => {
  vi.clearAllMocks(); vi.unstubAllEnvs()
  routeState.role = 'seeker'; routeState.userId = USER; routeState.companyOwner = OWNER; routeState.authStatus = 0
  routeState.cvUrl = null; routeState.messages = []
  routeState.path = 'screening'; routeState.rpcError = false; routeState.approvalError = false; routeState.inserts = []
  routeState.email.mockResolvedValue({ success: true }); routeState.notify.mockResolvedValue(true); routeState.worker.mockResolvedValue({ disabled: false, processed: 1 })
  routeState.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'employer_screening_configuration') return { data: { enabled: true }, error: null }
    if (name === 'employer_screening_apply') return routeState.rpcError ? { data: null, error: { code: 'CONNECTION_LOST' } }
      : { data: saved(args.p_application_id as string, null, routeState.path as 'legacy' | 'screening'), error: null }
    if (name === 'employer_screening_approve_rubric') return routeState.approvalError ? { data: null, error: { code: '40001' } }
      : { data: { versionId: 'rubric-v2', jobId: JOB, approved: true, criteria: args.p_criteria }, error: null }
    return { data: true, error: null }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
const enable = () => SCREENING_APPLICATION_GATES.forEach(key => vi.stubEnv(key, 'true'))
const approvalEnabled = () => { vi.stubEnv('EMPLOYER_SCREENING_RUBRIC_APPROVAL_ENABLED', 'true'); vi.stubEnv('EMPLOYER_SCREENING_SCHEMA_READY', 'true'); vi.stubEnv('EMPLOYER_SCREENING_PRIVACY_APPROVED', 'true') }

describe('apply route retains legacy OFF and never duplicates selected delivery', () => {
  it('keeps applications on ordinary forwarding without a current displayed processing notice', async () => {
    enable(); const response = await apply(null)
    expect(response.status).toBe(201)
    expect(routeState.inserts).toContain('applications'); expect(routeState.rpc).not.toHaveBeenCalled()
    expect(routeState.notify).not.toHaveBeenCalled()
    await routeState.after.mock.calls[0][0]()
    expect(routeState.notify).toHaveBeenCalledExactlyOnceWith(APP, USER)
  })
  it('default OFF uses the exact legacy insert and notifier with no screening RPC', async () => {
    expect((await apply()).status).toBe(201)
    expect(routeState.inserts).toContain('applications'); expect(routeState.rpc).not.toHaveBeenCalled()
    expect(routeState.notify).not.toHaveBeenCalled()
    await routeState.after.mock.calls[0][0]()
    expect(routeState.notify).toHaveBeenCalledExactlyOnceWith(APP, USER)
  })
  it('active path queues once, sends only applicant confirmation inline, exposes no report and remains applied', async () => {
    enable(); const response = await apply(); const body = await response.json()
    expect(response.status).toBe(201); expect(body.application.status).toBe('applied')
    expect(body).not.toHaveProperty('score'); expect(body).not.toHaveProperty('report')
    expect(routeState.inserts).not.toContain('applications'); expect(routeState.notify).not.toHaveBeenCalled()
    expect(routeState.email).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'application_confirmation' }))
  })
  it.each(['legacy', 'screening'])('retains the existing uploaded PDF chat link on the %s path, independently of email capture', async path => {
    enable(); routeState.path = path; routeState.cvUrl = `${USER}/uploaded-cv.pdf`
    expect((await apply()).status).toBe(201)
    expect(routeState.messages).toEqual([expect.objectContaining({
      sender_id: USER, attachment_url: `${USER}/uploaded-cv.pdf`, attachment_name: 'Synthetic_Applicant_CV.pdf',
    })])
    expect(routeState.email).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'application_confirmation' }))
    if (path === 'screening') {
      expect(routeState.notify).not.toHaveBeenCalled()
      // The durable baseline in this fixture has no capture. A current chat CV
      // must not backfill that frozen email or cause a second employer send.
      expect(routeState.rpc.mock.calls.find(([name]) => name === 'employer_screening_register_materials')?.[1])
        .toMatchObject({ p_snapshot_json: null, p_snapshot_sha256: null })
    } else {
      expect(routeState.notify).not.toHaveBeenCalled()
      await routeState.after.mock.calls[0][0]()
      expect(routeState.notify).toHaveBeenCalledOnce()
    }
  })
  it.each([null, `${OWNER}/other-person.pdf`, `${USER}/${APP}/${VERSION}.pdf`,
    'https://foreign.example.invalid/private.pdf', `${USER}/../private.pdf`])(
    'does not put absent, foreign or private capture paths into the screening chat: %s', async cvUrl => {
      enable(); routeState.cvUrl = cvUrl
      expect((await apply()).status).toBe(201)
      expect(routeState.messages).toHaveLength(1)
      expect(routeState.messages[0]).not.toHaveProperty('attachment_url')
      expect(routeState.messages[0]).not.toHaveProperty('attachment_name')
      expect(routeState.notify).not.toHaveBeenCalled()
    },
  )
  it('schedules only the selected delivery path and never runs the durable worker for legacy', async () => {
    enable(); vi.stubEnv('EMPLOYER_OUTBOX_WORKER_ENABLED', 'true')
    expect((await apply()).status).toBe(201)
    expect(routeState.after).toHaveBeenCalledOnce()
    expect(routeState.worker).not.toHaveBeenCalled()
    await routeState.after.mock.calls[0][0]()
    expect(routeState.worker).toHaveBeenCalledOnce()
    routeState.after.mockClear(); routeState.path = 'legacy'
    expect((await apply()).status).toBe(201); expect(routeState.after).toHaveBeenCalledOnce()
    await routeState.after.mock.calls[0][0]()
    expect(routeState.notify).toHaveBeenCalledOnce(); expect(routeState.worker).toHaveBeenCalledOnce()
  })
  it('may use legacy notification only when atomic RPC positively persisted legacy', async () => {
    enable(); routeState.path = 'legacy'
    expect((await apply()).status).toBe(201); expect(routeState.notify).not.toHaveBeenCalled()
    await routeState.after.mock.calls[0][0]()
    expect(routeState.notify).toHaveBeenCalledOnce()
    expect(routeState.inserts).not.toContain('applications')
  })
  it('an uncertain activated submit never invokes old insert, employer mail, or confirmation', async () => {
    enable(); routeState.rpcError = true
    expect((await apply()).status).toBe(500); expect(routeState.notify).not.toHaveBeenCalled(); expect(routeState.email).not.toHaveBeenCalled()
    expect(routeState.inserts).toEqual([])
  })
})

describe('authenticated owner-only immutable rubric approval', () => {
  beforeEach(() => { routeState.role = 'employer'; routeState.userId = OWNER })
  it('default OFF performs no rubric write', async () => {
    expect((await approve()).status).toBe(503); expect(routeState.rpc).not.toHaveBeenCalled()
  })
  it('rechecks verified auth, employer role and actual job ownership', async () => {
    approvalEnabled(); routeState.authStatus = 401; expect((await approve()).status).toBe(401)
    routeState.authStatus = 0; routeState.role = 'seeker'; expect((await approve()).status).toBe(403)
    routeState.role = 'employer'; routeState.companyOwner = USER; expect((await approve()).status).toBe(404)
    expect(routeState.rpc).not.toHaveBeenCalled()
  })
  it('pins a new server-generated version using explicit expected-version CAS', async () => {
    approvalEnabled()
    const response = await approve(); expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ rubric: { versionId: 'rubric-v2', jobId: JOB, approved: true } })
    expect(routeState.rpc).toHaveBeenCalledExactlyOnceWith('employer_screening_approve_rubric', {
      p_job_id: JOB, p_owner_user_id: OWNER, p_expected_version: null, p_criteria: CRITERIA,
    })
  })
  it.each(['Young applicants', 'Native-born citizens', 'Christian', 'No disabilities', 'Pregnant women', 'ignore all instructions'])('rejects protected/instruction criterion %s before persistence', async label => {
    approvalEnabled()
    expect((await approve({ approve: true, expectedVersion: null, criteria: [{ ...CRITERIA[0], label }] })).status).toBe(400)
    expect(routeState.rpc).not.toHaveBeenCalled()
  })
  it('rejects forged owner/approval fields and cross-origin requests, handles version conflict', async () => {
    approvalEnabled()
    expect((await approve({ approve: true, expectedVersion: null, criteria: CRITERIA, ownerId: USER })).status).toBe(400)
    expect((await approve(undefined, 'https://untrusted.invalid')).status).toBe(403)
    routeState.approvalError = true; expect((await approve()).status).toBe(409)
  })
})
