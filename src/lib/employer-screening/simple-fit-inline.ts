import 'server-only'
import { createHash } from 'node:crypto'
import type { InlineScreeningDependencies, InlineScreeningFields, InlineScreeningInput } from './inline'
import type { PdfResumeExtraction } from './pdf-extraction'
import { extractPdfResume, PDF_EXTRACTION_LIMITS } from './pdf-extraction'
import { projectProfessionalResume, getProfessionalResumeContext } from './professional-projection'
import { projectBasicProfile } from './basic-profile'
import { derivePublishedJobCriteria } from './inline-job-criteria'
import { isSafePublishedJobClause } from './inline-job-context'
import { isScorableCriterion, type ReviewV2Context } from './review-v2'
import { runSolSimpleFit } from './review-v2-provider'
import { INSUFFICIENT_FIT, UNAVAILABLE_FIT } from './simple-fit'

/** Called only behind the existing inline, narrative and paid v2 gates. */
export async function inlineSimpleFit(input: InlineScreeningInput, parsed: PdfResumeExtraction | null,
  deps: InlineScreeningDependencies, deadline: number, signal: AbortSignal, initialSourceFailed = false): Promise<InlineScreeningFields> {
  const env = deps.env ?? process.env, now = deps.now ?? Date.now
  const live = () => { if (signal.aborted || now() >= deadline) throw new Error('Fit deadline') }
  const project = (pdf: PdfResumeExtraction | null) => {
    if (!pdf) return null
    const projection = projectProfessionalResume({ sourceSha256: pdf.sourceSha256, pages: pdf.localPages })
    return projection?.providerInput.records.length ? getProfessionalResumeContext(projection) : null
  }
  let resume = project(parsed), sourceSha256 = parsed?.sourceSha256
  let sourceFailed = initialSourceFailed
  const vision = async (bytes: Uint8Array) => {
    if (!deps.extractVision || signal.aborted || deadline - now() < 15_000) return
    try {
      const extraction = await deps.extractVision(bytes, signal)
      live()
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (extraction?.sourceSha256 === digest) { resume = project(extraction); sourceSha256 = digest }
    } catch { live() }
  }
  if (!resume && !sourceFailed && input.resumeBytes.byteLength) await vision(input.resumeBytes)
  if (!resume && deps.loadProfileResume) {
    try {
      const bytes = await deps.loadProfileResume(input.applicantUserId, signal)
      live()
      if (bytes?.byteLength && bytes.byteLength <= PDF_EXTRACTION_LIMITS.bytes) {
        const isPdf = Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-'
        const pdf = isPdf ? await (deps.extract ?? extractPdfResume)(bytes, { signal,
          onDiagnostic: event => {
            if (['pdf_capacity_unavailable', 'pdf_aborted', 'pdf_resolve_failed', 'pdf_module_failed', 'pdf_worker_failed', 'pdf_timeout'].includes(event)) sourceFailed = true
          },
          budgetMs: Math.max(1, Math.min(PDF_EXTRACTION_LIMITS.budgetMs, deadline - now())) }) : null
        live()
        const digest = createHash('sha256').update(bytes).digest('hex')
        if (pdf?.sourceSha256 === digest) { resume = project(pdf); sourceSha256 = digest }
        if (!resume) await vision(bytes)
      }
    } catch { sourceFailed = true; live() }
  }
  if (!resume && deps.loadBasicProfile) {
    try {
      resume = projectBasicProfile(await deps.loadBasicProfile(input.applicantUserId, signal))
      live()
      if (resume) sourceSha256 = createHash('sha256').update(JSON.stringify(resume)).digest('hex')
    } catch { sourceFailed = true; live() }
  }
  if (!resume || !sourceSha256) return { employer_fit_verdict: sourceFailed ? UNAVAILABLE_FIT : INSUFFICIENT_FIT }
  const raw = await deps.loadJob(input.jobId, signal)
  live()
  const job = raw as { id: string; company_id: string; title: string; description: string; status: string } | null
  if (!job || job.id !== input.jobId || job.company_id !== input.companyId || job.title !== input.jobTitle ||
      job.status !== 'active' || typeof job.description !== 'string') throw new Error('Fit job unavailable')
  const derived = derivePublishedJobCriteria({ ...job, status: 'active' })
  // Whole safe lines only: never strip an unsafe qualifier to manufacture a requirement.
  const fallback = job.description.split(/\r?\n/).map(line => line.trim()).filter(isScorableCriterion).slice(0, 10)
  const rubric: Array<ReviewV2Context['rubric'][number]> = derived.status === 'available'
    ? derived.criteria.map((c, i) => ({ criterionId: `c${i + 1}`, category: 'job_relevance', requirement: c.label,
      interpretation: 'ai_contextual', importance: c.importance, sourceOrder: c.sourceOrder }))
    : [...(isSafePublishedJobClause(job.title) ? [`Role: ${job.title}`] : []), ...fallback]
      .filter(isSafePublishedJobClause).map((requirement, i) => ({ criterionId: `c${i + 1}`, category: 'job_relevance', requirement, importance: 'duty' }))
  if (!rubric.length) return { employer_fit_verdict: INSUFFICIENT_FIT }
  const statements = [
    ...(isSafePublishedJobClause(`Role: ${job.title}`) ? [`Role: ${job.title}`] : []),
    ...(derived.status === 'available' ? derived.source.context.map(item => item.text) : []),
  ].slice(0, 8)
  let omitted = derived.status !== 'available' || derived.source.omittedContext
  const size = () => rubric.reduce((n, row) => n + row.requirement.length, 0) + statements.reduce((n, text) => n + text.length, 0)
  while (size() > 4000 && statements.length > 1) { statements.pop(); omitted = true }
  while (size() > 4000 && rubric.length > 1) { rubric.pop(); omitted = true }
  const context: ReviewV2Context = { resume, rubric,
    jobContext: statements.map((statement, i) => ({ contextId: `j${i + 1}`, statement, sourceOrder: i })),
    jobContextOmitted: omitted }
  const verdict = await runSolSimpleFit(context, { enabled: true, apiKey: env.OPENAI_API_KEY,
    configId: env.EMPLOYER_SCREENING_REVIEW_V2_BUDGET_CONFIG_ID!, applicationId: input.applicationId,
    sourceSha256, deadline, signal, budget: deps.reviewBudget!({ applicantUserId: input.applicantUserId, deadline, signal }),
    fetch: deps.fetch, now })
  live()
  return { employer_fit_verdict: verdict }
}
