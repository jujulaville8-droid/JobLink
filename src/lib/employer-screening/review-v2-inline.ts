/** Exclusive v2 enrichment of the original in-memory attachment and single email.
 * Choosing v2 never falls back to a different paid model or to the old local score.
 */
import 'server-only'
import { z } from 'zod'
import { hasNarrativeReviewNotice } from './notice'
import type { InlineScreeningInput, InlineScreeningDependencies, InlineScreeningFields } from './inline'
import type { PdfResumeExtraction } from './pdf-extraction'
import { derivePublishedJobCriteria } from './inline-job-criteria'
import { inlineDiagnostic, JOB_MAPPING_REASON_EVENTS } from './inline-diagnostics'
import { projectProfessionalResume, getProfessionalResumeContext } from './professional-projection'
import { runSolResumeReview, type SolReviewStage } from './review-v2-provider'
import type { ReviewV2Context } from './review-v2'

const jobSchema = z.object({ id: z.string(), company_id: z.string(), title: z.string().min(1).max(1000),
  description: z.string(), status: z.literal('active') })
export async function inlineResumeReviewV2(input: InlineScreeningInput, parsed: PdfResumeExtraction,
  deps: InlineScreeningDependencies, deadline: number, signal: AbortSignal): Promise<InlineScreeningFields> {
  const env = deps.env ?? process.env, now = deps.now ?? Date.now
  const diagnostic = (event: Parameters<typeof inlineDiagnostic>[0]) => inlineDiagnostic(event, input.applicationId)
  const live = () => { if (signal.aborted || now() >= deadline) throw new Error('Review deadline') }
  live()
  if (!hasNarrativeReviewNotice(input.noticeVersion)) { diagnostic('review_v2_notice_missing'); return {} }
  if (env.EMPLOYER_SCREENING_REVIEW_V2_ENABLED !== 'true' || env.EMPLOYER_SCREENING_REVIEW_V2_PRIVACY_APPROVED !== 'true' ||
      env.EMPLOYER_SCREENING_BUDGET_APPROVED !== 'true' || env.EMPLOYER_SCREENING_PAID_PROVIDER_ENABLED !== 'true' ||
      !env.EMPLOYER_SCREENING_REVIEW_V2_BUDGET_CONFIG_ID || !env.OPENAI_API_KEY || !deps.reviewBudget) {
    diagnostic('review_v2_gates_disabled'); return {}
  }
  const projection = projectProfessionalResume({ sourceSha256: parsed.sourceSha256, pages: parsed.localPages })
  live()
  if (!projection || !projection.providerInput.records.length || projection.sourceSha256 !== parsed.sourceSha256) {
    diagnostic('review_v2_projection_empty'); return {}
  }
  const job = jobSchema.parse(await deps.loadJob(input.jobId, signal))
  live()
  if (job.id !== input.jobId || job.company_id !== input.companyId || job.title !== input.jobTitle) {
    diagnostic('job_binding_mismatch'); return {}
  }
  const derived = derivePublishedJobCriteria(job)
  if (derived.status !== 'available') {
    diagnostic('job_mapping_unavailable')
    if (derived.reason) diagnostic(JOB_MAPPING_REASON_EVENTS[derived.reason])
    return {}
  }
  const context: ReviewV2Context = {
    resume: getProfessionalResumeContext(projection),
    rubric: derived.criteria.map((criterion, index) => ({ criterionId: `c${index + 1}`, category: 'job_relevance',
      requirement: criterion.label, interpretation: 'ai_contextual', importance: criterion.importance, sourceOrder: criterion.sourceOrder })),
    jobContext: derived.source.context.map((item, index) => ({ contextId: `j${index + 1}`, statement: item.text, sourceOrder: item.sourceOrder })),
    jobContextOmitted: derived.source.omittedContext,
  }
  const stage = (event: SolReviewStage) => {
    if (event === 'admission_requested') diagnostic('review_v2_admission_requested')
    else if (event === 'admission_granted') diagnostic('review_v2_admission_granted')
    else if (event === 'admission_denied') diagnostic('review_v2_admission_denied')
    else if (event === 'count_started') diagnostic('review_v2_count_started')
    else if (event === 'count_validated') diagnostic('review_v2_count_validated')
    else if (event !== 'settlement_confirmed') diagnostic(event)
  }
  const report = await runSolResumeReview(context, { enabled: true, apiKey: env.OPENAI_API_KEY,
    configId: env.EMPLOYER_SCREENING_REVIEW_V2_BUDGET_CONFIG_ID, applicationId: input.applicationId,
    sourceSha256: parsed.sourceSha256, deadline, signal,
    budget: deps.reviewBudget({ applicantUserId: input.applicantUserId, deadline, signal }),
    fetch: deps.fetch, now, onStage: stage })
  live(); diagnostic('review_v2_completed')
  return { employer_resume_review_v2: report }
}
