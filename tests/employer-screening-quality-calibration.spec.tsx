import { describe, expect, it } from 'vitest'
import { buildResumeReviewV2Request, RESUME_REVIEW_V2_INSTRUCTIONS, TEXT_QUALITY_ANCHORS,
  TEXT_QUALITY_RUBRIC_VERSION, safeResumeReviewV2, validateResumeReviewV2, type ReviewV2Context } from '../src/lib/employer-screening/review-v2'
import { resumeReviewV2EmailSection, resumeReviewV2EmailText } from '../src/lib/employer-screening/review-v2-email'
import { projectProfessionalResume, getProfessionalResumeContext } from '../src/lib/employer-screening/professional-projection'
import { SYNTHETIC_REVIEW_PAGE, syntheticReviewContext, syntheticReviewRaw } from './fixtures/resume-review-v2'
import { QUALITY_CALIBRATION_CASES } from './fixtures/text-quality-calibration'

function rated(levels: number[], context = syntheticReviewContext()) {
  const raw = syntheticReviewRaw()
  raw.dimensions.slice(0, 3).forEach((dimension, index) => { dimension.level = levels[index] })
  return validateResumeReviewV2(context, raw)
}
function value(levels: number[]) {
  const score = rated(levels).qualityScore
  if (score.status !== 'scored') throw new Error('Expected complete scope')
  return score.value
}

describe('versioned quality anchors, offline only', () => {
  it('provides all distinct observable anchors and preserves the role-fit ladder', () => {
    expect(Object.keys(TEXT_QUALITY_ANCHORS)).toEqual(['clarity', 'organization', 'specificity'])
    Object.values(TEXT_QUALITY_ANCHORS).forEach(anchors => {
      expect(anchors).toHaveLength(5)
      anchors.forEach((anchor, index) => expect(anchor).toMatch(new RegExp(`^${index}:`)))
    })
    expect(RESUME_REVIEW_V2_INSTRUCTIONS).toContain('1 minimal, vague presentation; 2 partially developed/useful presentation with material documentary gaps; 3 clear and useful presentation; 4 consistently concrete, well-contextualized presentation.')
    for (const phrase of ['Do not demand more length', 'entry-level practice', 'visual layout cannot be judged', 'not a quality defect', 'do not invent flaws', 'briefly explain the most important one in that same overview', 'do not force a negative critique']) {
      expect(RESUME_REVIEW_V2_INSTRUCTIONS).toContain(phrase)
    }
  })

  for (const fixture of QUALITY_CALIBRATION_CASES) {
    it(`documents editorial expectations, not a model result: ${fixture.id}`, () => {
      const context: ReviewV2Context = { ...syntheticReviewContext(), resume: {
        records: fixture.text.map((text, order) => ({ id: `r${order + 1}`, section: order === 0 ? 'work' : 'skills', order, text })),
        coverage: 'full', omissions: { professionalContent: false, unclassifiedContent: false, limitReached: false }, overallQualityScoreAllowed: true,
      } }
      const request = buildResumeReviewV2Request(context)
      expect(request.input.qualityRatingAllowed).toBe(true)
      const raw = syntheticReviewRaw()
      raw.dimensions.slice(0, 3).forEach((dimension, index) => {
        dimension.level = fixture.levels[index]
        dimension.rationale = fixture.rationale[index]
      })
      const report = validateResumeReviewV2(context, raw)
      expect(report.qualityScore.status).toBe('scored')
      if (report.qualityScore.status === 'scored') {
        expect(report.qualityScore.value).toBeGreaterThanOrEqual(fixture.expectedScoreRange[0])
        expect(report.qualityScore.value).toBeLessThanOrEqual(fixture.expectedScoreRange[1])
      }
      expect(safeResumeReviewV2(report)).toEqual(report)
    })
  }

  it('is monotone for every quality level combination and never changes role fit', () => {
    const baselineRoleFit = rated([0, 0, 0]).roleFitScore
    for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) for (let c = 0; c <= 4; c++) {
      const levels = [a, b, c]
      expect(rated(levels).roleFitScore).toEqual(baselineRoleFit)
      for (let index = 0; index < 3; index++) {
        if (levels[index] === 4) continue
        const improved = [...levels]; improved[index]++
        expect(value(improved)).toBeGreaterThanOrEqual(value(levels))
      }
    }
  })

  it('records a content-improvement pair without pretending to execute semantic scoring', () => {
    const ordinary = QUALITY_CALIBRATION_CASES.find(row => row.id === 'ordinary-usable')!
    const improved = QUALITY_CALIBRATION_CASES.find(row => row.id === 'supported-skills-improved')!
    expect(value(improved.levels)).toBeGreaterThan(value(ordinary.levels))
    expect(value([2, 2, 2])).toBe(5)
    expect(value([3, 2, 2])).toBe(6)
    expect(value([3, 3, 3])).toBe(8)
    expect(value([4, 4, 3])).toBe(9)
    expect(value([4, 4, 4])).toBe(10)
  })

  it('excludes identity changes before scoring and retains equal editorial anchors for prestige-only variants', () => {
    const project = (text: string) => {
      const result = projectProfessionalResume({ sourceSha256: 'a'.repeat(64), pages: [text] })
      if (!result) throw new Error('Synthetic projection unavailable')
      return getProfessionalResumeContext(result)
    }
    const original = project(SYNTHETIC_REVIEW_PAGE)
    const renamed = project(SYNTHETIC_REVIEW_PAGE.replace('Jordan Ellis', 'Casey Morgan')
      .replace('jordan.ellis@example.invalid', 'casey.morgan@example.invalid').replace('555-0148', '555-0199'))
    expect(renamed).toEqual(original)
    expect(rated([3, 3, 3], { ...syntheticReviewContext(), resume: renamed }).qualityScore)
      .toEqual(rated([3, 3, 3], { ...syntheticReviewContext(), resume: original }).qualityScore)
    // This is a controlled editorial expectation and deterministic invariance,
    // not evidence that a model actually ignores employer prestige.
    const prestigious = project(SYNTHETIC_REVIEW_PAGE.replace('Example Retail', 'Prestigious Global Retail'))
    expect(rated([3, 3, 3], { ...syntheticReviewContext(), resume: prestigious }).qualityScore)
      .toEqual(rated([3, 3, 3], { ...syntheticReviewContext(), resume: original }).qualityScore)
  })

  it('preserves historical metadata, totals and email wording without silent relabeling', () => {
    const report = rated([3, 3, 3])
    expect(report.scope.qualityRubricVersion).toBe(TEXT_QUALITY_RUBRIC_VERSION)
    const old = structuredClone(report)
    delete old.scope.qualityRubricVersion
    expect(safeResumeReviewV2(old)).toEqual(old)
    expect(resumeReviewV2EmailText(old)).toContain('Résumé quality: 8/10')
    expect(resumeReviewV2EmailText(old)).not.toContain('Text-only assessment')
    for (const rendered of [resumeReviewV2EmailText(report), resumeReviewV2EmailSection(report)]) {
      expect(rendered).toContain('Résumé text quality:')
      expect(rendered).toContain('Text-only assessment; visual layout is not assessed.')
    }
    expect(safeResumeReviewV2({ ...report, scope: { ...report.scope, qualityRubricVersion: 'future-unknown' } })).toBeNull()
  })

  it('retains unknown, coverage and independent job-context gates', () => {
    const context = syntheticReviewContext()
    const raw = syntheticReviewRaw()
    raw.dimensions[0] = { ...raw.dimensions[0], basis: 'unknown', level: null, sourceIds: [] }
    expect(validateResumeReviewV2(context, raw).qualityScore).toEqual({ status: 'unavailable', reason: 'unassessable_dimensions' })
    // Avoid not_evidenced gaps when job scope is incomplete.
    raw.gaps = []
    raw.dimensions[0] = syntheticReviewRaw().dimensions[0]
    const report = validateResumeReviewV2({ ...context, jobContextOmitted: true }, raw)
    expect(report.qualityScore.status).toBe('scored')
    expect(report.roleFitScore.status).toBe('unavailable')
    const partial = { ...context, resume: { ...context.resume, coverage: 'partial' as const, overallQualityScoreAllowed: false,
      omissions: { ...context.resume.omissions, professionalContent: true } } }
    expect(validateResumeReviewV2(partial, raw).qualityScore.status).toBe('unavailable')
  })
})
