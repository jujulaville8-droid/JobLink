import { describe, expect, it } from 'vitest'
import { captureSnapshot, readSnapshot, validateAssessment } from '../src/lib/employer-screening'
import { employerAdvisoryEmailSection } from '../src/lib/employer-screening/email'
import { minimizeScreeningSnapshot } from '../src/lib/employer-screening/privacy'
const fixture = () => ({ applicationId: 'synthetic-app', companyId: 'synthetic-company', jobId: 'synthetic-job', createdAt: 100,
  resume: { versionId: 'synthetic-pdf', sha256: 'a'.repeat(64), evidence: [
    { id: 'skill_1', category: 'skill', excerpt: 'Microsoft Excel', location: 'pdf.page[1].span[0:15]' },
  ] }, job: { title: 'Synthetic Office Assistant', versionId: 'published-v1' },
  rubric: { versionId: 'published-v1', jobId: 'synthetic-job', approved: false, source: 'published_job_requirements',
    descriptionSha256: 'b'.repeat(64), mappingVersion: 'published-job-v1', omittedContext: false, jobContext: [], criteria: [
      { id: 'excel', label: 'Microsoft Excel', category: 'skill', weight: 50, verificationRequired: false, interpretation: 'ai_contextual', importance: 'required', sourceOrder: 0 },
      { id: 'service', label: 'Customer service experience', category: 'relevant_experience', weight: 50, verificationRequired: false, interpretation: 'ai_contextual', importance: 'required', sourceOrder: 0 },
    ] },
})
const findings = [ { criterionId: 'excel', finding: 'supported', evidenceIds: ['skill_1'] },
  { criterionId: 'service', finding: 'unknown', evidenceIds: [] } ]
describe('published criteria provenance is not employer approval', () => {
  it('binds the exact published description and mapping version without claiming approval', () => {
    const frozen = captureSnapshot(fixture())
    expect(readSnapshot(frozen).rubric).toMatchObject({ approved: false, source: 'published_job_requirements', descriptionSha256: 'b'.repeat(64) })
    const changed = fixture(); changed.rubric.descriptionSha256 = 'c'.repeat(64)
    expect(captureSnapshot(changed).sha256).not.toBe(frozen.sha256)
  })
  it('rejects unapproved arbitrary rubrics and fabricated approval/source hybrids', () => {
    for (const bad of [ { ...fixture().rubric, source: undefined }, { ...fixture().rubric, approved: true },
      { ...fixture().rubric, descriptionSha256: 'bad' }, { ...fixture().rubric, source: 'model_inferred' } ]) {
      expect(() => captureSnapshot({ ...fixture(), rubric: bad })).toThrow()
    }
    const unequal = fixture(); unequal.rubric.criteria[0].weight = 60; unequal.rubric.criteria[1].weight = 40
    expect(() => captureSnapshot(unequal)).toThrow()
  })
  it('retains the unchanged approved-rubric format', () => {
    const { source, descriptionSha256, mappingVersion, omittedContext, jobContext, ...rubric } = fixture().rubric
    void source; void descriptionSha256; void mappingVersion; void omittedContext; void jobContext
    expect(readSnapshot(captureSnapshot({ ...fixture(), rubric: { ...rubric, approved: true, criteria: rubric.criteria.map(({ interpretation, importance, sourceOrder, ...criterion }) => { void interpretation; void importance; void sourceOrder; return criterion }) } })).rubric.approved).toBe(true)
  })
  it('excludes source identifiers and hashes from provider data', () => {
    const payload = JSON.stringify(minimizeScreeningSnapshot(readSnapshot(captureSnapshot(fixture()))))
    expect(payload).not.toContain('published-v1'); expect(payload).not.toContain('b'.repeat(64))
    expect(payload).not.toContain('synthetic-job'); expect(payload).not.toContain('approved')
    expect(payload).toContain('Microsoft Excel')
  })
  it('labels equal-weight published criteria without changing unknown points', () => {
    const report = validateAssessment(captureSnapshot(fixture()), findings)
    expect(report).toMatchObject({ supportedPoints: 50, unresolvedPoints: 50, criteriaSource: 'published_job_requirements', weighting: 'equal' })
    const html = employerAdvisoryEmailSection(report, null)
    expect(html).toContain('50/100'); expect(html).toContain('50 unresolved')
    expect(html).toContain('Published job criteria, equal weights'); expect(html).not.toContain('employer-approved')
    expect(html).not.toMatch(/AI[- ]reviewed|human[- ]reviewed/i)
  })
  it('marks a job comparison partial when relevant context was omitted', () => {
    const value = fixture(); value.rubric.omittedContext = true
    const report = validateAssessment(captureSnapshot(value), findings)
    expect(employerAdvisoryEmailSection(report, null)).toContain('Partial scope')
    expect(report).toMatchObject({ supportedPoints: 50, unresolvedPoints: 50, jobContextOmitted: true })
  })
  it('rejects forged equal-weight captions at the rendering boundary', () => {
    const report = validateAssessment(captureSnapshot(fixture()), findings)
    expect(employerAdvisoryEmailSection({ ...report, weighting: undefined }, null)).toContain('No score was assigned')
  })
})
