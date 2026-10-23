/** Generates files only. Synthetic evidence, injected fixture processor, no clients or email sends. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { captureSnapshot, screen } from '../src/lib/employer-screening'
import { buildEmailHtml } from '../src/lib/email-templates'
async function main() {
  const snapshot = captureSnapshot({ applicationId: 'demo-application', companyId: 'demo-company', jobId: 'demo-job', createdAt: Date.now(),
    resume: { versionId: 'synthetic-resume-v1', sha256: createHash('sha256').update('Synthetic résumé fixture only').digest('hex'), evidence: [
      { id: 'excel', category: 'skill', excerpt: 'Maintained weekly stock records using Excel spreadsheets.', location: 'Synthetic résumé, page 1 · Skills' },
      { id: 'orders', category: 'relevant_experience', excerpt: 'Processed customer orders and answered enquiries at the front desk.', location: 'Synthetic résumé, page 1 · Experience' },
    ] }, job: { title: 'Office Assistant', versionId: 'synthetic-job-v1' },
    rubric: { jobId: 'demo-job', versionId: 'SYNTHETIC-DEMO-v1', approved: true, criteria: [
      { id: 'records', label: 'Spreadsheet record keeping', category: 'skill', weight: 40, verificationRequired: false },
      { id: 'service', label: 'Customer order experience', category: 'relevant_experience', weight: 30, verificationRequired: false },
      { id: 'certificate', label: 'Role-specific certification', category: 'job_certification', weight: 30, verificationRequired: true },
    ] } })
  const report = await screen(snapshot, async () => [
    { criterionId: 'records', finding: 'supported', evidenceIds: ['excel'] },
    { criterionId: 'service', finding: 'supported', evidenceIds: ['orders'] },
    { criterionId: 'certificate', finding: 'unknown', evidenceIds: [] },
  ])
  const common = { applicant_name: 'Synthetic Candidate', job_title: 'Office Assistant', company_name: 'Example Employer (demo)', cv_attached: false,
    cover_letter_excerpt: 'Synthetic demonstration only. This is an example employer email, not a real application or an AI-generated assessment.' }
  mkdirSync('artifacts/employer-screening', { recursive: true })
  for (const [name, assessment] of [['scored', report], ['unavailable', { status: 'unavailable' }]] as const) {
    const { html } = buildEmailHtml('new_applicant', { ...common, employer_screening: assessment })
    writeFileSync(`artifacts/employer-screening/${name}.html`, html)
  }
  writeFileSync('artifacts/employer-screening/validated-report.json', JSON.stringify(report, null, 2))
  console.log('Wrote synthetic employer email previews; no messages sent.')
}
void main()
