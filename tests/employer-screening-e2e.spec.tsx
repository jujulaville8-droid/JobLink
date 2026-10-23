// @vitest-environment node
import { createRequire } from 'node:module'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { setupOutboxDb, outboxFixture, call, uuid, rpcClient, outboxStore } from './helpers/employer-outbox-db.mjs'
import { submitScreeningApplication } from '../src/lib/employer-screening/application'
import { captureApplicationResume } from '../src/lib/employer-screening/capture'
import { extractPdfResume } from '../src/lib/employer-screening/pdf-extraction'
import { composeBaseline, processNext, type Processor } from '../src/lib/employer-screening'
import { createResendTransport } from '../src/lib/employer-screening/transport'
import { minimizeScreeningSnapshot } from '../src/lib/employer-screening/privacy'
const require = createRequire(import.meta.url)
const PDFDocument = require('pdfkit')
let db: PGlite
beforeAll(async () => { db = new PGlite(); await setupOutboxDb(db) }, 30_000)
afterAll(async () => { await db?.close() })
async function pdf() {
  const doc = new PDFDocument({ compress: true }), chunks: Buffer[] = []
  const complete = new Promise<Uint8Array>((resolve, reject) => { doc.on('data', (b: Buffer) => chunks.push(b)); doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks)))); doc.on('error', reject) })
  doc.text('Synthetic Applicant').moveDown().text('Work Experience').text('Office Assistant | Synthetic Supply').text('2022 - 2025').text('Maintained spreadsheet records').moveDown().text('Skills').text('Microsoft Excel').text('Customer service'); doc.end(); return complete
}
describe('synthetic uploaded PDF through atomic apply and one employer email', () => {
  it.each(['scored', 'missing-cv', 'missing-rubric', 'corrupt-snapshot', 'corrupt-quality', 'provider-failure', 'budget-denial', 'expired-deadline'])('forwards original baseline for %s', async scenario => {
    const f = await outboxFixture(db, { attachment: false, rubric: false })
    await db.exec("UPDATE employer_delivery.outbox SET state='blocked'")
    const job = uuid(), app = uuid(), files = new Map<string, Uint8Array>(), bytes = await pdf()
    await db.query("INSERT INTO public.job_listings(id,company_id,title,description,status) VALUES($1,$2,'Office Assistant','Synthetic','active')", [job, f.company])
    if (scenario !== 'missing-rubric') await call(db, 'employer_screening_approve_rubric', {
      p_job_id: job, p_owner_user_id: f.employer, p_expected_version: null,
      p_criteria: JSON.stringify([{ id: 'excel', label: 'Microsoft Excel', category: 'skill', weight: 100, verificationRequired: false }]),
    })
    const result = await submitScreeningApplication({ jobId: job, applicantUserId: f.applicant, seekerId: f.profile, coverLetter: 'Synthetic letter' }, {
      db: rpcClient(db), uuid: () => app,
      capture: (applicationId, userId) => scenario === 'missing-cv' ? Promise.resolve(null) : captureApplicationResume(applicationId, userId, {
        readSource: async () => ({ first_name: 'Test', last_name: 'Applicant', cv_url: `${userId}/source.pdf` }),
        download: async () => bytes, loadBuilder: async () => null, renderBuilder: async () => bytes,
        extractPdf: extractPdfResume, write: async (path, captured) => {
          const { createHash } = await import('node:crypto')
          expect(await call(db, 'employer_outbox_register_capture', { p_application_id: app, p_applicant_user_id: f.applicant, p_storage_path: path, p_sha256: createHash('sha256').update(captured).digest('hex') })).toBe(true)
          files.set(path, Uint8Array.from(captured))
        },
      }),
    })
    expect(result.deliveryPath).toBe('screening')
    if (scenario === 'corrupt-snapshot') await db.query("UPDATE employer_delivery.outbox SET snapshot_sha256=$2 WHERE application_id=$1", [app, 'f'.repeat(64)])
    if (scenario === 'corrupt-quality') await db.query("UPDATE employer_delivery.outbox SET quality_sha256=$2 WHERE application_id=$1", [app, 'e'.repeat(64)])
    const sent: Record<string, unknown>[] = []
    const transport = createResendTransport({ enabled: true, apiKey: 'synthetic-only',
      readAttachment: async descriptor => files.get(descriptor.storagePath)!,
      fetch: async (url, options) => {
        expect(url).toBe('https://api.resend.com/emails')
        sent.push(JSON.parse(options!.body as string))
        return new Response(JSON.stringify({ id: `synthetic-${app}` }), { status: 200 })
      },
    })
    let calls = 0
    const processor: Processor = async snapshot => {
      calls++; const minimized = minimizeScreeningSnapshot(snapshot)
      expect(JSON.stringify(minimized)).not.toContain('Test Applicant')
      if (scenario === 'provider-failure' || scenario === 'budget-denial') throw new Error('Unavailable')
      return [{ criterionId: 'excel', finding: 'supported', evidenceIds: [snapshot.resume.evidence.find(e => e.excerpt === 'Microsoft Excel')!.id] }]
    }
    const now = scenario === 'expired-deadline' ? () => Date.now() + 121_000 : Date.now
    const store = outboxStore(db)
    expect(await processNext(store, processor, composeBaseline, transport, now)).toBe(true)
    expect(await processNext(store, processor, composeBaseline, transport, now)).toBe(false)
    expect(sent).toHaveLength(1)
    expect(sent[0].html).toContain("JobLink<br>Antigua &amp; Barbuda's Job Platform")
    expect(sent[0].html).not.toContain('JobLink &mdash;')
    expect(sent[0].html).not.toContain('AI-assessed')
    expect(sent[0].html).toContain(['scored', 'corrupt-quality'].includes(scenario) ? '100/100' : 'No score was assigned')
    if (['missing-cv', 'corrupt-quality'].includes(scenario)) {
      expect(sent[0].html).toContain('Résumé presentation:</strong> Not assessed')
      expect(sent[0].html).not.toMatch(/[0-9]+(?:\.[0-9]+)?\/10(?!\d)/)
      expect(sent[0].html).not.toContain('assessed points')
    }
    else {
      expect(sent[0].html).toContain('Résumé presentation:')
      expect(sent[0].html).toContain('<strong>10/10</strong> supported · Recognizable sections · Task details present')
      expect(sent[0].html).not.toContain('assessed points')
      expect(sent[0].html).not.toContain('Synthetic Supply')
    }
    if (scenario === 'missing-cv') expect(sent[0].attachments).toBeUndefined()
    else expect(Buffer.from((sent[0].attachments as { content: string }[])[0].content, 'base64')).toEqual(Buffer.from(bytes))
    if (['missing-cv', 'missing-rubric', 'corrupt-snapshot', 'expired-deadline'].includes(scenario)) expect(calls).toBe(0)
    const saved = await db.query<{ status: string }>('SELECT status FROM public.applications WHERE id=$1', [app])
    expect(saved.rows[0].status).toBe('applied')
  }, 20_000)
})
