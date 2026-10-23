import { describe, expect, it } from 'vitest'
import { buildEmailHtml } from '../src/lib/email-templates'
import { resumeReviewV2EmailSection, resumeReviewV2EmailText, REVIEW_V2_EMAIL_FOOTER } from '../src/lib/employer-screening/review-v2-email'
import { validateResumeReviewV2 } from '../src/lib/employer-screening/review-v2'
import { projectProfessionalResume } from '../src/lib/employer-screening/professional-projection'
import { SYNTHETIC_REVIEW_PAGE, syntheticReviewContext, syntheticReviewRaw, syntheticReviewReport } from './fixtures/resume-review-v2'

const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

describe('compact v2 employer email section', () => {
  it('uses a fictional exact-page projection and hand-authored review, with quality8 and role evidence4', () => {
    const projection = projectProfessionalResume({ sourceSha256: 'a'.repeat(64), pages: [SYNTHETIC_REVIEW_PAGE] })
    expect(projection?.providerInput.coverage).toBe('full')
    expect(projection?.providerInput.records.map(row => row.id)).toEqual(['r1', 'r2'])
    expect(projection?.providerInput.overallQualityScoreAllowed).toBe(true)
    const admittedText = projection!.providerInput.records.map(row => row.text).join('\n')
    expect(admittedText).not.toContain('Jordan Ellis')
    expect(admittedText).not.toContain('example.invalid')
    expect(admittedText).not.toContain('555-0148')
    expect(admittedText).toContain('March 2022 – September 2025')
    expect(admittedText).toContain('followed up\ndelayed deliveries')
    expect(admittedText).toContain('Point-of-sale systems')
    for (const source of projection!.localSources) {
      expect(source.spans).toHaveLength(1)
      const span = source.spans[0]
      expect(SYNTHETIC_REVIEW_PAGE.slice(span.start, span.end)).toBe(projection!.providerInput.records.find(row => row.id === source.id)!.text)
    }
    const report = syntheticReviewReport()
    expect(report.qualityScore).toEqual({ status: 'scored', value: 8, outOf: 10 })
    expect(report.roleFitScore).toEqual({ status: 'scored', value: 4, outOf: 10 })
    const html = resumeReviewV2EmailSection(report)
    expect(html).toContain('Résumé text quality:</strong> <strong>8/10</strong>')
    expect(html).toContain('Résumé fit for this role:</strong> <strong>4/10</strong>')
    expect(html).toContain('Highlights')
    expect(html).toContain('Gaps for this role')
    expect(html.match(/<li>/g)).toHaveLength(4)
    expect(html.match(/\?/g)).toHaveLength(2)
    expect(plain(html).split(' ').length).toBeLessThanOrEqual(155)
    expect(html).toContain(REVIEW_V2_EMAIL_FOOTER)
    expect(resumeReviewV2EmailText(report)).toContain(REVIEW_V2_EMAIL_FOOTER)
    expect(resumeReviewV2EmailText(report)).not.toContain('unverified')
    expect(html).not.toMatch(/AI[- ]reviewed|model[- ]reviewed|verified candidate|recommended|should not apply|reject|qualified candidate|attached/i)
  })

  it('renders inside the existing single new-applicant email and takes precedence over v1 details', () => {
    const output = buildEmailHtml('new_applicant', {
      applicant_name: 'Jordan Ellis', job_title: 'Outbound Sales Representative', company_name: 'Example Supply',
      cv_attached: false, employer_resume_review_v2: syntheticReviewReport(), employer_screening: { status: 'unavailable' },
    })
    expect(output.subject).toContain('Jordan Ellis just applied')
    expect(output.html.match(/You Have a New Applicant/g)).toHaveLength(1)
    expect(output.html.match(/Résumé overview/g)).toHaveLength(1)
    expect(output.html).toContain('A CV attachment is unavailable')
    expect(output.html).not.toContain('CV is attached')
    expect(output.html).not.toContain('Tip: Responding quickly')
    expect(output.html).not.toContain('Job requirement evidence')
  })

  it('never claims an attachment unless the trusted baseline says one is present', () => {
    for (const cvAttached of [undefined, false, true]) {
      const output = buildEmailHtml('new_applicant', {
        applicant_name: 'Jordan Ellis', job_title: 'Outbound Sales Representative',
        cv_attached: cvAttached, employer_resume_review_v2: syntheticReviewReport(),
      })
      expect(output.html.includes('CV is attached to this email')).toBe(cvAttached === true)
      expect(output.html).toContain(REVIEW_V2_EMAIL_FOOTER)
    }
    expect(resumeReviewV2EmailSection(null)).toBe('<p>Résumé review unavailable. Please review the original résumé.</p>')
    expect(resumeReviewV2EmailSection(null)).not.toMatch(/attached/i)
  })

  it('has no numeric rating on partial input and calls out partial coverage separately', () => {
    const context = syntheticReviewContext()
    const raw = syntheticReviewRaw()
    raw.overview.text = 'The available sections describe customer-service tasks; omitted professional text limits this review.'
    raw.gaps = raw.gaps.map(gap => ({ ...gap, basis: 'uncertain_scope', text: 'The available text does not allow this part of the role evidence to be assessed.' }))
    // Distinct points rather than duplicate filler: the questions remain bounded.
    raw.gaps[1].text = 'Omitted professional context may affect the interpretation of the stated record-keeping work.'
    const report = validateResumeReviewV2({ ...context, resume: { ...context.resume, coverage: 'partial',
      omissions: { ...context.resume.omissions, professionalContent: true }, overallQualityScoreAllowed: false } }, raw)
    const html = resumeReviewV2EmailSection(report)
    expect(html).not.toMatch(/\b\d+\/10\b/)
    expect(html).toContain('Partial text assessment')
    expect(html.match(/Not rated:/g)).toHaveLength(2)
    expect(html).toContain('Highlights')
    expect(resumeReviewV2EmailText(report)).not.toMatch(/\b\d+\/10\b/)
  })

  it('omits unassessable ratings without converting unknown into a zero', () => {
    const raw = syntheticReviewRaw()
    raw.dimensions = raw.dimensions.map(d => ({ ...d, basis: 'unknown', level: null, sourceIds: [], criterionIds: [] }))
    raw.highlights = []
    raw.gaps = []
    const html = resumeReviewV2EmailSection(validateResumeReviewV2(syntheticReviewContext(), raw))
    expect(html).not.toMatch(/\b\d+\/10\b/)
    expect(html).not.toContain('<ul')
    expect(html).not.toContain('Highlights')
    expect(html).not.toContain('Gaps for this role')
  })

  it('escapes valid prose and applicant details while rejecting unsafe markup instead of rendering it', () => {
    const raw = syntheticReviewRaw()
    raw.overview.text = 'The résumé describes "customer support" & order tracking.'
    const html = resumeReviewV2EmailSection(validateResumeReviewV2(syntheticReviewContext(), raw))
    expect(html).toContain('&quot;customer support&quot; &amp; order tracking')
    expect(html).not.toContain('"customer support" & order tracking')
    const report = syntheticReviewReport()
    const corrupt = { ...report, overview: { ...report.overview, text: '<img src=x onerror=alert(1)>' } }
    expect(resumeReviewV2EmailSection(corrupt)).toContain('Résumé review unavailable')
    expect(resumeReviewV2EmailSection(corrupt)).not.toContain('<img')
    const output = buildEmailHtml('new_applicant', { applicant_name: '<script>synthetic</script>', job_title: 'Sales & Service', employer_resume_review_v2: report })
    expect(output.html).toContain('&lt;script&gt;synthetic&lt;/script&gt;')
    expect(output.html).not.toContain('<script>')
    expect(output.html).toContain('Sales &amp; Service')
  })

  it('fails closed on forged totals, invalid references, unsafe judgments and corrupt persisted reports', () => {
    const report = syntheticReviewReport()
    for (const value of [
      null, undefined, {}, { ...report, qualityScore: { status: 'scored', value: 10, outOf: 10 } },
      { ...report, coverage: 'partial' }, { ...report, extra: 'unexpected' },
      { ...report, overview: { ...report.overview, sourceIds: ['r40'] } },
      { ...report, overview: { ...report.overview, text: 'This applicant should not apply.' } },
    ]) {
      const html = resumeReviewV2EmailSection(value)
      expect(html).toBe('<p>Résumé review unavailable. Please review the original résumé.</p>')
      expect(html).not.toMatch(/\d+\/10/)
      expect(resumeReviewV2EmailText(value)).toBe('Résumé review unavailable. Please review the original résumé.')
    }
  })
})
