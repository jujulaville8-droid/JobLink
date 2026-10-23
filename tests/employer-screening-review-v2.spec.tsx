import { describe, expect, it } from 'vitest'
import {
  buildResumeReviewV2Request, INSUFFICIENT_REVIEW_OVERVIEW, isSafeResumeReviewText,
  RESUME_REVIEW_V2_DEFAULT_ENABLED, RESUME_REVIEW_V2_INSTRUCTIONS, RESUME_REVIEW_V2_LIMITATION,
  REVIEW_V2_DIMENSIONS, safeResumeReviewV2, validateResumeReviewV2,
  type ResumeReviewV2Response, type ReviewV2Context,
} from '../src/lib/employer-screening/review-v2'
import type { ProfessionalProjectionData } from '../src/lib/employer-screening/professional-projection'

function context(resume: Partial<ProfessionalProjectionData> = {}, changes: Partial<ReviewV2Context> = {}): ReviewV2Context {
  return {
    resume: {
      records: [
        { id: 'r1', section: 'work', order: 0,
          text: 'Office assistant. Maintained spreadsheet records and processed supplier invoices. Prepared weekly stock reports using Microsoft Excel and reconciled discrepancies with delivery records.' },
        { id: 'r2', section: 'skills', order: 1,
          text: 'Microsoft Excel: spreadsheet tables, formulas and reconciliation. Bookkeeping: invoice records, supplier account reconciliation and transaction filing.' },
      ], coverage: 'full', omissions: { professionalContent: false, unclassifiedContent: false, limitReached: false },
      overallQualityScoreAllowed: true, ...resume,
    },
    rubric: [
      { criterionId: 'c1', category: 'job_relevance', requirement: 'Maintain accurate spreadsheet records', interpretation: 'ai_contextual', importance: 'duty', sourceOrder: 0 },
      { criterionId: 'c2', category: 'job_relevance', requirement: 'Microsoft Excel skills preferred', interpretation: 'ai_contextual', importance: 'preferred', sourceOrder: 1 },
    ], jobContext: [], jobContextOmitted: false, ...changes,
  }
}
function response(): ResumeReviewV2Response {
  return {
    overview: { text: 'The résumé presents spreadsheet and invoice work relevant to this role, with useful task detail but limited explanation of how discrepancies were resolved.', sourceIds: ['r1'], criterionIds: ['c1'] },
    dimensions: REVIEW_V2_DIMENSIONS.map(definition => ({
      dimensionId: definition.id, basis: 'observed', level: 3,
      rationale: definition.group === 'quality' ? 'The professional statements identify tasks and tools in clear language.' : 'The stated spreadsheet work connects directly to the published record-keeping duties.',
      sourceIds: ['r1'], criterionIds: definition.group === 'quality' ? [] : ['c1'],
    })),
    highlights: [{ text: 'Spreadsheet records and invoice processing are described as performed tasks relevant to the role.', sourceIds: ['r1'], criterionIds: ['c1'] }],
    gaps: [{ text: 'The spreadsheet examples provide limited detail about the checks used to resolve discrepancies.',
      basis: 'limited_evidence', question: 'Could you describe a spreadsheet discrepancy you investigated and the checks you used?', sourceIds: ['r1'], criterionIds: ['c1'] }],
  }
}
function allUnknown(): ResumeReviewV2Response {
  const raw = response()
  raw.dimensions = raw.dimensions.map(item => ({ ...item, basis: 'unknown', level: null, sourceIds: [], criterionIds: [] }))
  raw.highlights = []
  raw.gaps = []
  return raw
}

describe('resume narrative review v2, local only', () => {
  it('stays default OFF and builds one bounded structured request without overall model scores', () => {
    expect(RESUME_REVIEW_V2_DEFAULT_ENABLED).toBe(false)
    const request = buildResumeReviewV2Request(context())
    expect(request.schema.additionalProperties).toBe(false)
    expect(request.schema.required).toEqual(['overview', 'dimensions', 'highlights', 'gaps'])
    expect(request.input.qualityRatingAllowed).toBe(true)
    expect(JSON.stringify(request.input)).not.toContain('sourceSha256')
    expect(JSON.stringify(request.schema)).toContain('r1')
    expect(JSON.stringify(request.schema)).toContain('c2')
    expect(RESUME_REVIEW_V2_INSTRUCTIONS).toContain('Missing résumé evidence is not inability')
    expect(RESUME_REVIEW_V2_INSTRUCTIONS).toContain('Do not return numeric overall scores')
    expect(RESUME_REVIEW_V2_INSTRUCTIONS).toContain('not a mechanical checklist')
  })

  it('provides two deterministic integer document ratings with meaningful compact narrative', () => {
    const report = validateResumeReviewV2(context(), response())
    expect(report.qualityScore).toEqual({ status: 'scored', value: 8, outOf: 10 })
    expect(report.roleFitScore).toEqual({ status: 'scored', value: 8, outOf: 10 })
    expect(report.highlights).toHaveLength(1)
    expect(report.gaps[0].question).toContain('discrepancy')
    expect(report.limitation).toBe(RESUME_REVIEW_V2_LIMITATION)
    expect(report.limitation).toContain('do not verify the generated interpretation')
    expect(safeResumeReviewV2(report)).toEqual(report)
  })

  it('scores quality and role presentation independently without a partial denominator', () => {
    const raw = response()
    raw.dimensions.forEach((dimension, index) => { dimension.level = index < 3 ? 4 : 2 })
    const report = validateResumeReviewV2(context(), raw)
    expect(report.qualityScore).toEqual({ status: 'scored', value: 10, outOf: 10 })
    expect(report.roleFitScore).toEqual({ status: 'scored', value: 5, outOf: 10 })
    raw.dimensions[0] = { ...raw.dimensions[0], basis: 'unknown', level: null, sourceIds: [] }
    const unknown = validateResumeReviewV2(context(), raw)
    expect(unknown.qualityScore).toEqual({ status: 'unavailable', reason: 'unassessable_dimensions' })
    expect(unknown.roleFitScore).toEqual({ status: 'scored', value: 5, outOf: 10 })
  })

  it('allows entry-level qualification/skill documents without requiring employment history', () => {
    const records: ProfessionalProjectionData['records'] = [
      { id: 'r1', section: 'qualifications', order: 0,
        text: 'Business administration coursework included spreadsheet records, preparing invoices and reconciling sample transaction logs. Completed a class exercise tracing spreadsheet entry errors.' },
      { id: 'r2', section: 'skills', order: 1, text: 'Microsoft Excel tables and formulas were used in classroom practice exercises.' },
    ]
    const request = buildResumeReviewV2Request(context({ records }))
    expect(request.input.qualityRatingAllowed).toBe(true)
  })

  it('allows one substantive professional record and never demands prescribed sections', () => {
    const records: ProfessionalProjectionData['records'] = [{ id: 'r1', section: 'work', order: 0,
      text: `${context().resume.records[0].text} Maintained account reconciliation logs, recorded invoice references, checked entries against supplier statements, and documented outstanding items for follow-up. Used spreadsheet tables to group unresolved entries and track corrections.` }]
    expect(buildResumeReviewV2Request(context({ records })).input.qualityRatingAllowed).toBe(true)
    expect(validateResumeReviewV2(context({ records }), response()).qualityScore.status).toBe('scored')
  })

  it('withholds both ratings on partial professional input regardless of high or low model levels', () => {
    const input = context({ coverage: 'partial', omissions: { professionalContent: true, unclassifiedContent: false, limitReached: false }, overallQualityScoreAllowed: false })
    for (const level of [0, 4]) {
      const raw = response()
      raw.dimensions.forEach(item => { item.level = level })
      const report = validateResumeReviewV2(input, raw)
      expect(report.qualityScore).toEqual({ status: 'unavailable', reason: 'partial_professional_input' })
      expect(report.roleFitScore).toEqual({ status: 'unavailable', reason: 'partial_professional_input' })
      expect(safeResumeReviewV2(report)).not.toBeNull()
    }
  })

  it('never scores all-unknown, insufficient professional input, or incomplete job scope', () => {
    expect(validateResumeReviewV2(context(), allUnknown()).qualityScore).toEqual({ status: 'unavailable', reason: 'unassessable_dimensions' })
    const short = context({ records: [{ id: 'r1', section: 'skills', text: 'Microsoft Excel', order: 0 }], overallQualityScoreAllowed: false })
    expect(validateResumeReviewV2(short, allUnknown()).roleFitScore).toEqual({ status: 'unavailable', reason: 'insufficient_professional_input' })
    const incomplete = context({}, { jobContextOmitted: true })
    expect(validateResumeReviewV2(incomplete, response()).qualityScore).toEqual({ status: 'scored', value: 8, outOf: 10 })
    expect(validateResumeReviewV2(incomplete, response()).roleFitScore).toEqual({ status: 'unavailable', reason: 'incomplete_job_context' })
  })

  it('separates quality and role-fit eligibility without inventing unknown dimensions', () => {
    const input = context({}, { jobContextOmitted: true })
    const request = buildResumeReviewV2Request(input)
    expect(request.input.qualityRatingAllowed).toBe(true)
    expect(request.input.roleFitRatingAllowed).toBe(false)
    expect(request.input).not.toHaveProperty('overallRatingsAllowed')
    expect(request.instructions).toContain('independently of job-context omissions')
    const report = validateResumeReviewV2(input, response())
    expect(report.qualityScore).toEqual({ status: 'scored', value: 8, outOf: 10 })
    expect(report.roleFitScore).toEqual({ status: 'unavailable', reason: 'incomplete_job_context' })
    expect(safeResumeReviewV2(report)).toEqual(report)
    const unknown = response()
    unknown.dimensions[0] = { ...unknown.dimensions[0], basis: 'unknown', level: null, sourceIds: [] }
    expect(validateResumeReviewV2(input, unknown).qualityScore).toEqual({ status: 'unavailable', reason: 'unassessable_dimensions' })
    const partial = buildResumeReviewV2Request(context({ coverage: 'partial', omissions: { professionalContent: true, unclassifiedContent: false, limitReached: false }, overallQualityScoreAllowed: false }))
    expect(partial.input.qualityRatingAllowed).toBe(false)
    expect(partial.input.roleFitRatingAllowed).toBe(false)
    expect(buildResumeReviewV2Request(context()).input.roleFitRatingAllowed).toBe(true)
    const noProfessionalCriteria = buildResumeReviewV2Request(context({}, { rubric: [
      { criterionId: 'c1', category: 'job_relevance', requirement: 'A warm and welcoming personality' },
    ] }))
    expect(noProfessionalCriteria.input.qualityRatingAllowed).toBe(true)
    expect(noProfessionalCriteria.input.roleFitRatingAllowed).toBe(false)
  })

  it('preserves historical incomplete-job-context rating semantics', () => {
    const report = validateResumeReviewV2(context({}, { jobContextOmitted: true }), response())
    const historical = { ...structuredClone(report), qualityScore: {
      status: 'unavailable' as const, reason: 'incomplete_job_context' as const,
    } }
    delete historical.scope.independentQualityScope
    expect(safeResumeReviewV2(historical)).toEqual(historical)
    // Removing the policy marker cannot reinterpret an existing computed score.
    const invalid = structuredClone(report)
    delete invalid.scope.independentQualityScope
    expect(safeResumeReviewV2(invalid)).toBeNull()
  })

  it('permits no-record input only as explicitly insufficient, not a zero-quality document', () => {
    const input = context({ records: [], coverage: 'none', overallQualityScoreAllowed: false })
    const raw = allUnknown()
    raw.overview = { text: INSUFFICIENT_REVIEW_OVERVIEW, sourceIds: [], criterionIds: [] }
    const report = validateResumeReviewV2(input, raw)
    expect(report.qualityScore.status).toBe('unavailable')
    expect(report.roleFitScore.status).toBe('unavailable')
    expect(safeResumeReviewV2(report)).not.toBeNull()
    raw.overview.text = 'The résumé is vague and provides limited professional detail.'
    expect(() => validateResumeReviewV2(input, raw)).toThrow('insufficient-scope')
  })

  it('permits documented role evidence absence only on full sufficient input', () => {
    const raw = response()
    raw.dimensions[3] = { ...raw.dimensions[3], basis: 'not_evidenced', level: 0, sourceIds: [], rationale: 'The supplied professional text does not describe the cited role duty.' }
    raw.gaps[0] = { ...raw.gaps[0], basis: 'not_evidenced', sourceIds: [], text: 'The supplied résumé does not describe the cited record-keeping duty.' }
    expect(validateResumeReviewV2(context(), raw).roleFitScore).toEqual({ status: 'scored', value: 5, outOf: 10 })
    expect(() => validateResumeReviewV2(context({ coverage: 'partial', overallQualityScoreAllowed: false }), raw)).toThrow('incomplete input')
    expect(() => validateResumeReviewV2(context({}, { jobContextOmitted: true }), raw)).toThrow('incomplete input')
    raw.dimensions[0] = { ...raw.dimensions[0], basis: 'not_evidenced', level: 0, sourceIds: [] }
    expect(() => validateResumeReviewV2(context(), raw)).toThrow('incomplete input')
  })

  it('requires all six unique dimensions, complete references, and source-backed observations', () => {
    const missing = response()
    missing.dimensions.pop()
    expect(() => validateResumeReviewV2(context(), missing)).toThrow()
    const duplicate = response()
    duplicate.dimensions[5] = { ...duplicate.dimensions[0] }
    expect(() => validateResumeReviewV2(context(), duplicate)).toThrow('Incomplete review dimensions')
    for (const id of ['r0', 'r41', 'e1', 'r3']) {
      const raw = response()
      raw.overview.sourceIds = [id]
      expect(() => validateResumeReviewV2(context(), raw)).toThrow()
    }
    for (const id of ['c0', 'c21', 'x1', 'c3']) {
      const raw = response()
      raw.gaps[0].criterionIds = [id]
      expect(() => validateResumeReviewV2(context(), raw)).toThrow()
    }
    const repeated = response()
    repeated.highlights[0].sourceIds = ['r1', 'r1']
    expect(() => validateResumeReviewV2(context(), repeated)).toThrow('duplicate')
    const unanchored = response()
    unanchored.dimensions[0].sourceIds = []
    expect(() => validateResumeReviewV2(context(), unanchored)).toThrow('requires a source')
    const unmapped = response()
    unmapped.dimensions[3].criterionIds = []
    expect(() => validateResumeReviewV2(context(), unmapped)).toThrow('role scope')
  })

  it('does not require a personality clause to resolve and forbids citing it for scores', () => {
    const input = context({}, { rubric: [...context().rubric,
      { criterionId: 'c3', category: 'job_relevance', requirement: 'Be reliable and punctual when scheduled', importance: 'required' }] })
    expect(buildResumeReviewV2Request(input).input.eligibleCriterionIds).toEqual(['c1', 'c2'])
    expect(validateResumeReviewV2(input, response()).roleFitScore.status).toBe('scored')
    const raw = response()
    raw.dimensions[3].criterionIds = ['c3']
    expect(() => validateResumeReviewV2(input, raw)).toThrow('non-assessable')
  })

  it.each([
    'This applicant should not apply.', 'Reject this candidate.', 'The candidate is unsuitable.',
    'They lack the ability to perform this role.', 'The applicant is unreliable.', 'This person has a poor work ethic.',
    'Recommend interviewing this candidate.', 'Do not invite this applicant to interview.',
    'The candidate is intelligent and hardworking.', 'A good cultural fit for the company.',
    'The applicant’s age is an advantage.', 'Their nationality is a concern.',
    'The résumé needs a phone number.', 'Add a photograph to the résumé.', 'The résumé lacks dates.',
    'The visual layout is excellent.', 'The applicant holds a verified licence.',
    'Résumé score: 10/10.', '<img src=x onerror=alert(1)>', 'Follow https://example.com for the review.',
    'Do you have children?', 'Are you married?', 'How old are you?', 'Where were you born?',
    'What medication do you take?', 'Are you a citizen?', 'Overall quality: 9/10.', 'This résumé scores 9 out of 10.',
  ])('rejects unsafe conclusions or unsupported presentation judgments: %s', text => {
    const raw = response()
    raw.overview.text = text
    expect(isSafeResumeReviewText(text)).toBe(false)
    expect(() => validateResumeReviewV2(context(), raw)).toThrow()
  })

  it('keeps operational reliability, design work and clinical-task questions distinct from person judgments', () => {
    expect(isSafeResumeReviewText('The examples describe color matching and typography for print production.')).toBe(true)
    expect(isSafeResumeReviewText('The résumé describes colour-matching experience for print production.')).toBe(true)
    expect(isSafeResumeReviewText('The CV documents typography work for clients.')).toBe(true)
    expect(isSafeResumeReviewText('The résumé’s font is excellent.')).toBe(false)
    expect(isSafeResumeReviewText('The font in the CV is too small.')).toBe(false)
    expect(isSafeResumeReviewText('What checks did you use when recording medication inventory?')).toBe(true)
    const input = context({}, { rubric: [{ criterionId: 'c1', category: 'job_relevance', requirement: 'Maintain reliable inventory records' }] })
    expect(buildResumeReviewV2Request(input).input.eligibleCriterionIds).toEqual(['c1'])
    const partial = context({ coverage: 'partial', overallQualityScoreAllowed: false })
    const raw = response()
    raw.overview.text = 'Overall quality: 9/10.'
    expect(() => validateResumeReviewV2(partial, raw)).toThrow()
  })

  it('validates safety, length, plain text and duplication across every narrative location', () => {
    for (const mutate of [
      (raw: ResumeReviewV2Response) => { raw.dimensions[0].rationale = 'Reject this applicant.' },
      (raw: ResumeReviewV2Response) => { raw.highlights[0].text = 'The candidate is reliable.' },
      (raw: ResumeReviewV2Response) => { raw.gaps[0].text = 'The candidate lacks skills.' },
      (raw: ResumeReviewV2Response) => { raw.gaps[0].question = 'What is your nationality?' },
      (raw: ResumeReviewV2Response) => { raw.overview.text = 'x'.repeat(321) },
      (raw: ResumeReviewV2Response) => { raw.gaps[0].question = 'Explain this example.' },
      (raw: ResumeReviewV2Response) => { raw.gaps[0].question = 'Which tools did you use? What steps did you take?' },
      (raw: ResumeReviewV2Response) => { raw.highlights.push({ ...raw.highlights[0] }) },
      (raw: ResumeReviewV2Response) => { raw.gaps[0].text = raw.highlights[0].text },
      (raw: ResumeReviewV2Response) => { raw.overview.text = 'A clear\nprofessional document.' },
      (raw: ResumeReviewV2Response) => { raw.overview.text = 'A clear\u200bprofessional document.' },
    ]) {
      const raw = response()
      mutate(raw)
      expect(() => validateResumeReviewV2(context(), raw)).toThrow()
    }
    const extra = { ...response(), overallScore: 10 }
    expect(() => validateResumeReviewV2(context(), extra)).toThrow()
    const extraQuestions = { ...response(), interviewQuestions: ['Any other qualifications?'] }
    expect(() => validateResumeReviewV2(context(), extraQuestions)).toThrow()
  })

  it('rejects forged renderer totals, partial scope ratings, extra fields and malformed persistence', () => {
    const report = validateResumeReviewV2(context(), response())
    expect(safeResumeReviewV2({ ...report, qualityScore: { status: 'scored', value: 9, outOf: 10 } })).toBeNull()
    expect(safeResumeReviewV2({ ...report, coverage: 'partial' })).toBeNull()
    expect(safeResumeReviewV2({ ...report, extra: true })).toBeNull()
    expect(safeResumeReviewV2({ ...report, scope: { ...report.scope, sourceIds: ['r2'] } })).toBeNull()
    const unknown = validateResumeReviewV2(context(), allUnknown())
    expect(safeResumeReviewV2({ ...unknown, qualityScore: { status: 'scored', value: 0, outOf: 10 } })).toBeNull()
    const getter = Object.defineProperty({}, 'overview', { enumerable: true, get() { throw new Error('Should not execute') } })
    expect(safeResumeReviewV2(getter)).toBeNull()
    expect(() => validateResumeReviewV2(context(), getter)).toThrow('response limit')
  })

  it('accepts >6 source/criterion scope IDs while preserving bounded output arrays', () => {
    const base = context()
    const input = context({ records: Array.from({ length: 9 }, (_, i) => ({
      id: `r${i + 1}`, order: i, section: 'work' as const, text: base.resume.records[0].text,
    })) }, { rubric: Array.from({ length: 12 }, (_, i) => ({ ...base.rubric[0], criterionId: `c${i + 1}`, sourceOrder: i })) })
    const report = validateResumeReviewV2(input, response())
    expect(report.scope.sourceIds).toHaveLength(9)
    expect(report.scope.criterionIds).toHaveLength(12)
    expect(safeResumeReviewV2(report)).not.toBeNull()
    const oversized = { ...report, scope: { ...report.scope, sourceIds: Array.from({ length: 41 }, (_, i) => `r${i + 1}`) } }
    expect(safeResumeReviewV2(oversized)).toBeNull()
  })

  it('checks context consistency and rejects unapproved metadata rather than forwarding it', () => {
    expect(() => buildResumeReviewV2Request(context({ coverage: 'partial', overallQualityScoreAllowed: true }))).toThrow('context')
    expect(() => buildResumeReviewV2Request(context({ omissions: { professionalContent: true, unclassifiedContent: false, limitReached: false } }))).toThrow('context')
    expect(() => buildResumeReviewV2Request(context({ records: [{ id: 'r1', section: 'summary', order: 0, text: 'A professional summary. '.repeat(20) }] }))).toThrow('context')
    const raw = { ...context(), applicantEmail: 'private@example.test' }
    expect(() => buildResumeReviewV2Request(raw)).toThrow()
    const repeated = context({ records: [context().resume.records[0], context().resume.records[0]] })
    expect(() => buildResumeReviewV2Request(repeated)).toThrow('context')
  })

  it('does not advertise citation validation as proof of entailment or verified credentials', () => {
    const report = validateResumeReviewV2(context(), response())
    expect(report.limitation).toContain('claims are unverified')
    expect(report.limitation).toContain('source references do not verify')
    expect(RESUME_REVIEW_V2_INSTRUCTIONS).toContain('Source IDs anchor interpretation, not truth')
    expect(RESUME_REVIEW_V2_INSTRUCTIONS).toContain('Never invent facts')
  })
})
