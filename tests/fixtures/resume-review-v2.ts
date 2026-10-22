/** Entirely fictional, hand-authored OFFLINE example. No model was called. */
import { projectProfessionalResume, getProfessionalResumeContext } from '../../src/lib/employer-screening/professional-projection'
import { validateResumeReviewV2, type ReviewV2Context, type ResumeReviewV2Response } from '../../src/lib/employer-screening/review-v2'

export const SYNTHETIC_REVIEW_PAGE = `Jordan Ellis
Customer Service Assistant
jordan.ellis@example.invalid | +1 (268) 555-0148
Work Experience
Customer Service Assistant | Example Retail
March 2022 – September 2025
Answered customer enquiries at the service counter and by telephone.
Explained product options, recorded order details and followed up
delayed deliveries. Resolved order queries with the stock team and
updated a spreadsheet customer log after each enquiry.
Skills
Customer enquiry handling; product explanations; complaint follow-up; order records.
Microsoft Excel: spreadsheet tables, filters and customer follow-up logs.
Point-of-sale systems and stock-enquiry records.`

export function syntheticReviewContext(): ReviewV2Context {
  const projection = projectProfessionalResume({ sourceSha256: 'a'.repeat(64), pages: [SYNTHETIC_REVIEW_PAGE] })
  if (!projection) throw new Error('Synthetic résumé projection unavailable')
  return { resume: getProfessionalResumeContext(projection),
    rubric: [
      { criterionId: 'c1', category: 'job_relevance', requirement: 'Make outbound prospecting calls to introduce products', interpretation: 'ai_contextual', importance: 'duty', sourceOrder: 0 },
      { criterionId: 'c2', category: 'job_relevance', requirement: 'Follow up sales leads and close orders', interpretation: 'ai_contextual', importance: 'duty', sourceOrder: 1 },
      { criterionId: 'c3', category: 'job_relevance', requirement: 'Maintain CRM pipeline records and next steps', interpretation: 'ai_contextual', importance: 'duty', sourceOrder: 2 },
      { criterionId: 'c4', category: 'job_relevance', requirement: 'Explain product options and answer customer questions', interpretation: 'ai_contextual', importance: 'duty', sourceOrder: 3 },
    ], jobContext: [], jobContextOmitted: false,
  }
}

export function syntheticReviewRaw(): ResumeReviewV2Response {
  return {
    overview: { text: 'Clear customer-service experience, but this outbound-sales role needs prospecting and closing examples that the résumé does not show.', sourceIds: ['r1'], criterionIds: ['c1', 'c2'] },
    dimensions: [
      { dimensionId: 'clarity', basis: 'observed', level: 3, rationale: 'Direct task descriptions make the customer-service responsibilities clear.', sourceIds: ['r1'], criterionIds: [] },
      { dimensionId: 'organization', basis: 'observed', level: 3, rationale: 'Separate work and skills sections associate the role with its tasks and tools.', sourceIds: ['r1', 'r2'], criterionIds: [] },
      { dimensionId: 'specificity', basis: 'observed', level: 3, rationale: 'The résumé specifies enquiry handling, delivery follow-up and spreadsheet record-keeping.', sourceIds: ['r1', 'r2'], criterionIds: [] },
      { dimensionId: 'duty_alignment', basis: 'observed', level: 1, rationale: 'Inbound enquiry handling is described, but it does not establish outbound prospecting or closing work.', sourceIds: ['r1'], criterionIds: ['c1', 'c2'] },
      { dimensionId: 'qualification_evidence', basis: 'observed', level: 2, rationale: 'Product explanations and spreadsheet logs are relevant documentary evidence, but no CRM pipeline use is stated.', sourceIds: ['r1', 'r2'], criterionIds: ['c3', 'c4'] },
      { dimensionId: 'role_example_detail', basis: 'observed', level: 2, rationale: 'Customer-contact examples are concrete, while the stated examples stop short of a sales process.', sourceIds: ['r1'], criterionIds: ['c1', 'c2', 'c4'] },
    ],
    highlights: [
      { text: 'Product explanations and customer enquiries are described with concrete tasks.', sourceIds: ['r1'], criterionIds: ['c4'] },
      { text: 'Order follow-up and spreadsheet logs provide relevant record-keeping examples.', sourceIds: ['r1', 'r2'], criterionIds: ['c3'] },
    ],
    gaps: [
      { text: 'Outbound prospecting and closing work are not evidenced.', basis: 'not_evidenced',
        question: 'Can you describe any cold-outreach or sales-closing work?', sourceIds: [], criterionIds: ['c1', 'c2'] },
      { text: 'CRM pipeline tracking is not shown.', basis: 'not_evidenced',
        question: 'What tools have you used to track leads and next steps?', sourceIds: [], criterionIds: ['c3'] },
    ],
  }
}

export function syntheticReviewReport() {
  return validateResumeReviewV2(syntheticReviewContext(), syntheticReviewRaw())
}
