import { describe, expect, it } from 'vitest'
import { employerAdvisoryEmailSection, resumeDocumentQualityEmailSection, screeningEmailSection } from '../src/lib/employer-screening/email'
import { assessResumeDocumentQuality, type ResumeDocumentQuality } from '../src/lib/employer-screening/quality'

const sha = 'a'.repeat(64)
const quality = (text: string): ResumeDocumentQuality => {
  const result = assessResumeDocumentQuality({ sourceSha256: sha, localPages: [text] }, sha)
  if (result.status !== 'assessed') throw new Error('Synthetic document fixture unavailable')
  return result
}
const fullQuality = () => quality('Experience\nOffice Assistant | Example Supply\n• Maintained spreadsheet records')
const partialQuality = () => quality('Experience\nRole: Office Assistant\nTask: Maintained spreadsheet records')
const job = () => ({
  status: 'scored' as const, rubricVersion: 'synthetic-v1', supportedPoints: 70, unresolvedPoints: 30, evidenceCoverage: 70,
  criteria: [
    { label: 'Microsoft Excel', weight: 40, finding: 'supported' as const, verificationRequired: false, evidence: [{ excerpt: 'Microsoft Excel', location: 'pdf.page[1].span[0:15]' }] },
    { label: 'Customer service experience', weight: 30, finding: 'supported' as const, verificationRequired: false, evidence: [{ excerpt: 'Assisted customers', location: 'pdf.page[1].span[20:38]' }] },
    { label: 'First aid certification', weight: 30, finding: 'unknown' as const, verificationRequired: true, evidence: [] },
  ],
})
const allUnknown = () => ({ ...job(), supportedPoints: 0, unresolvedPoints: 100, evidenceCoverage: 0,
  criteria: job().criteria.map(criterion => ({ ...criterion, finding: 'unknown' as const, evidence: [] })) })
const textContent = (html: string) => html.replace(/<[^>]*>/g, ' ')
const presentationText = (html: string) => textContent(html.match(/<strong>Résumé presentation:<\/strong>([\s\S]*?)<\/p>/)?.[1] ?? '')

describe('compact combined employer advisory email', () => {
  it('shows separate presentation points out of 10 with grounded notes, honest job points and a verification prompt', () => {
    const html = employerAdvisoryEmailSection(job(), fullQuality())
    expect(html).toContain('70/100')
    expect(html).toContain('30 unresolved')
    expect(html).not.toContain('% coverage')
    expect(html).toContain('<small>Unverified résumé evidence</small>')
    expect(html).toContain('Recognizable sections · Task details present')
    expect(presentationText(html)).toContain('10/10')
    expect(presentationText(html)).toContain('supported')
    expect(presentationText(html)).not.toContain('points')
    expect(presentationText(html)).not.toContain('Partial assessment')
    expect(html).toContain('Rule-based presentation checks')
    expect(html).toContain('<li>Microsoft Excel</li>')
    expect(html).toContain('<li>Customer service experience</li>')
    expect(html).toContain('First aid certification · evidence needed')
    expect(html).not.toContain('Verify First aid certification')
    expect(html).not.toContain('verify applicant-reported claim')
    expect(html.match(/<section/g)).toHaveLength(1)
    expect(html.length).toBeLessThan(3000)
    expect(textContent(html).trim().split(/\s+/).length).toBeLessThanOrEqual(80)
    expect(html).toContain('<strong>To verify</strong>')
    expect(html).not.toContain('pdf.page[')
    expect(html).not.toContain('synthetic-v1')
    expect(html).not.toContain('Assisted customers')
  })

  it('orders presentation, highlights, verification, job match and the human decision note without claiming AI or human review', () => {
    const html = employerAdvisoryEmailSection(job(), fullQuality())
    const headings = ['Résumé presentation:', 'Highlights', 'To verify', 'Job match:', 'Advisory only.']
    const positions = headings.map(heading => html.indexOf(heading))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(html).toContain('Unverified résumé evidence')
    expect(html).not.toMatch(/AI[- ](?:assessed|reviewed|assisted)|human[- ]reviewed|independently verified/i)
    for (const input of [allUnknown(), { status: 'unavailable' }, null]) {
      const fallback = employerAdvisoryEmailSection(input, null)
      expect(fallback).not.toMatch(/AI[- ](?:assessed|reviewed|assisted)|human[- ]reviewed/i)
      expect(fallback.indexOf('Résumé presentation:')).toBeLessThan(fallback.indexOf('Job match:'))
    }
  })

  it('keeps a partial presentation score on the fixed whole-rubric denominator and labels it clearly', () => {
    const html = employerAdvisoryEmailSection(job(), partialQuality())
    expect(html).toContain('Recognizable sections · Some checks not assessed')
    expect(partialQuality().supportedPoints).toBe(50)
    expect(partialQuality().observablePoints).toBe(50)
    expect(presentationText(html)).toContain('5/10')
    expect(presentationText(html)).toContain('supported')
    expect(presentationText(html)).not.toContain('points')
    expect(presentationText(html)).toContain('Partial assessment')
    expect(presentationText(html)).not.toContain('10/10')
    expect(presentationText(html)).not.toContain('Task details present')
    expect(html).toContain('Résumé presentation:')
    expect(html).not.toContain('% coverage')
    expect(html).not.toContain('100/100')
    expect(html).not.toContain('50/100')
  })

  it('scales fractional supported presentation points without normalizing partial coverage', () => {
    const q = quality('Experience\nOffice Assistant | Example Supply\n• Maintained spreadsheet records\nUnrecognized Role Title\nSecond Company\nUnrecognized description')
    const html = employerAdvisoryEmailSection(job(), q)
    expect(q.supportedPoints).toBe(62.5)
    expect(q.unknownPoints).toBe(37.5)
    expect(html).toContain('Some checks not assessed')
    expect(presentationText(html)).toContain('6.25/10')
    expect(presentationText(html)).toContain('Partial assessment')
    expect(presentationText(html)).not.toContain('10/10')
    expect(html).not.toContain('100/100')
    expect(html).not.toContain('% coverage')
  })

  it('preserves all-unknown job evidence without a misleading 0/100 or invented strengths', () => {
    const html = employerAdvisoryEmailSection(allUnknown(), partialQuality())
    expect(html).toContain('No job-specific evidence established')
    expect(html).toContain('100 points unresolved')
    expect(html).not.toContain('% coverage')
    expect(html).not.toMatch(/\b0\/100\b/)
    expect(html).not.toContain('Highlights')
    expect(html.match(/<li>/g)).toHaveLength(2)
    expect(html).toContain('First aid certification · evidence needed')
    expect(html).toContain('Microsoft Excel · evidence needed')
    expect(html).not.toContain('failed requirement')
  })

  it('shows all-unknown document presentation as unassessable, not zero quality', () => {
    const html = employerAdvisoryEmailSection(job(), quality('Unrecognized layout\nUnrecognized prose'))
    expect(presentationText(html)).toContain('Not assessed')
    expect(presentationText(html)).not.toMatch(/\d|points|score/)
    expect(presentationText(html)).not.toContain('Partial assessment')
    expect(html).not.toContain('0/0')
    expect(html).not.toMatch(/\b0\/100\b/)
  })

  it('independently retains quality when job match is unavailable and vice versa', () => {
    const documentOnly = employerAdvisoryEmailSection({ status: 'unavailable' }, partialQuality())
    expect(documentOnly).toContain('Job match unavailable. No score was assigned.')
    expect(documentOnly).toContain('Recognizable sections · Some checks not assessed')
    expect(documentOnly).not.toContain('Highlights')
    const jobOnly = employerAdvisoryEmailSection(job(), { status: 'unavailable' })
    expect(jobOnly).toContain('70/100')
    expect(presentationText(jobOnly)).toContain('Not assessed')
    expect(presentationText(jobOnly)).not.toMatch(/\d\/10/)
  })

  it('does not invent strengths from unknown, contradicted or unvalidated criteria', () => {
    const base = job()
    const input = { ...base, supportedPoints: 40, unresolvedPoints: 30,
      criteria: base.criteria.map((criterion, index) => index === 1 ? { ...criterion, finding: 'contradicted' as const } : criterion) }
    const html = employerAdvisoryEmailSection(input, null)
    expect(html).toContain('<li>Microsoft Excel</li>')
    expect(html).not.toContain('<li>Customer service experience</li>')
    expect(html).toContain('30 contradicted')
    const corrupt = employerAdvisoryEmailSection({ ...input, supportedPoints: 100 }, null)
    expect(corrupt).toContain('No score was assigned.')
    expect(corrupt).not.toContain('Highlights')
    expect(corrupt).not.toContain('Customer service experience')
  })

  it('reserves applicant-reported verification wording for supported cited findings, not unknown or contradicted requirements', () => {
    const input = job()
    const supported = { ...input, supportedPoints: 100, unresolvedPoints: 0, evidenceCoverage: 100,
      criteria: input.criteria.map((criterion, index) => index === 2 ? { ...criterion, finding: 'supported' as const,
        evidence: [{ excerpt: 'First aid certification', location: 'PDF page 1' }] } : criterion) }
    const supportedHtml = employerAdvisoryEmailSection(supported, null)
    expect(supportedHtml).toContain('First aid certification · verify applicant-reported claim')
    const unknownHtml = employerAdvisoryEmailSection(input, null)
    expect(unknownHtml).toContain('First aid certification · evidence needed')
    expect(unknownHtml).not.toContain('verify applicant-reported claim')
    const contradicted = { ...supported, supportedPoints: 70,
      criteria: supported.criteria.map((criterion, index) => index === 2 ? { ...criterion, finding: 'contradicted' as const } : criterion) }
    const contradictedHtml = employerAdvisoryEmailSection(contradicted, null)
    expect(contradictedHtml).toContain('First aid certification · clarify conflicting evidence')
    expect(contradictedHtml).not.toContain('Verify First aid certification')
    expect(contradictedHtml).not.toContain('verify applicant-reported claim')
  })

  it('limits and deduplicates supported strengths and verification prompts', () => {
    const input = { status: 'scored', rubricVersion: 'synthetic', supportedPoints: 100, unresolvedPoints: 0, evidenceCoverage: 100,
      criteria: Array.from({ length: 5 }, (_, index) => ({ label: `Supported requirement ${index + 1}`, weight: 20,
        finding: 'supported', verificationRequired: true, evidence: [{ excerpt: 'Reviewed evidence', location: 'Page 1' }] })) }
    const html = employerAdvisoryEmailSection(input, null)
    expect(html.match(/<li>/g)).toHaveLength(4)
    expect(html).toContain('Supported requirement 1')
    expect(html).toContain('Supported requirement 2')
    expect(html).not.toContain('Supported requirement 3')
    const duplicates = { ...input, criteria: input.criteria.map(criterion => ({ ...criterion, label: 'Same requirement' })) }
    expect(employerAdvisoryEmailSection(duplicates, null).match(/<li>/g)).toHaveLength(2)
  })

  it('uses only validated explicit document issues for document verification prompts', () => {
    const q = quality('Experience\nRole: [Enter role]\nTask: [Insert task]')
    const html = employerAdvisoryEmailSection(null, q)
    expect(html).toContain('Review the unfilled role, project or credential field (PDF page 1).')
    expect(html).toContain('Review the unfilled task/evidence field (PDF page 1).')
    expect(html.match(/<li>/g)).toHaveLength(2)
    expect(html).not.toContain('Highlights')
    expect(q.supportedPoints).toBe(25)
    expect(q.observablePoints).toBe(75)
    expect(presentationText(html)).toContain('2.5/10')
    expect(presentationText(html)).toContain('Partial assessment')
    const corrupt = structuredClone(q)
    corrupt.dimensions[1].findings[0].status = 'supported'
    expect(employerAdvisoryEmailSection(null, corrupt)).not.toContain('unfilled')
  })

  it('permits zero supported credit only when validated presentation checks were actually assessed', () => {
    const q = quality('Experience\nRole: [Enter role]\nTask: [Insert task]')
    // A valid report may contain observed issues but no supported observations.
    q.dimensions[0] = { ...q.dimensions[0], supportedPoints: 0, observablePoints: 0, unknownPoints: 25,
      findings: [{ code: 'organization_unknown', status: 'unknown', evidence: [] }] }
    q.supportedPoints = 0
    q.observablePoints = 50
    q.unknownPoints = 50
    q.evidenceCoverage = 50
    const before = structuredClone(q)
    const html = employerAdvisoryEmailSection(job(), q)
    expect(presentationText(html)).toContain('0/10')
    expect(presentationText(html)).toContain('Partial assessment')
    expect(presentationText(html)).not.toContain('Not assessed')
    expect(html).toContain('Review the unfilled role, project or credential field')
    expect(q).toEqual(before)
  })

  it('grounds presentation notes in validated findings, not labels, unsupported prose or person-merit judgments', () => {
    const html = employerAdvisoryEmailSection(job(), quality('Experience\nRole: X\nEmployer: X\nTasks: X'))
    expect(presentationText(html)).toContain('Recognizable sections · Some checks not assessed')
    expect(presentationText(html)).not.toMatch(/Task details present|Professional entry identified|excellent|poor|candidate/i)
    const corrupt = fullQuality()
    corrupt.dimensions[2].findings[0].evidence = []
    expect(presentationText(employerAdvisoryEmailSection(job(), corrupt))).toContain('Not assessed')
  })

  it('summarizes an observed unfilled field when verification slots are occupied, without exceeding two notes', () => {
    const input = job()
    input.criteria[0].verificationRequired = true
    const q = quality('Experience\nRole: [Enter role]\nTask: [Insert task]')
    const html = employerAdvisoryEmailSection(input, q)
    expect(presentationText(html)).toContain('Unfilled entry field · Some checks not assessed')
    expect(presentationText(html)).not.toContain('Recognizable sections')
    expect(presentationText(html)).not.toContain('Unfilled task field')
    expect(html).not.toContain('Review the unfilled')
  })

  it('does not duplicate presentation issues already described in verification prompts', () => {
    const html = employerAdvisoryEmailSection(null, quality('Experience\nRole: [Enter role]\nTask: [Insert task]'))
    expect(html).toContain('Review the unfilled role, project or credential field')
    expect(presentationText(html)).not.toMatch(/Unfilled entry field|Unfilled task field/)
    expect(presentationText(html)).toContain('Recognizable sections · Some checks not assessed')
  })

  it('prioritizes required verification and actual document issues over generic unknown prompts', () => {
    const html = employerAdvisoryEmailSection(allUnknown(), quality('Experience\nRole: [Enter role]\nTask: [Insert task]'))
    expect(html).toContain('First aid certification · evidence needed')
    expect(html).toContain('Review the unfilled role, project or credential field')
    expect(html).not.toContain('Microsoft Excel · evidence needed')
    expect(html.match(/<li>/g)).toHaveLength(2)
  })

  it('escapes every supplied label and never renders raw evidence or source markup', () => {
    const input = job()
    input.criteria[0].label = '<b>Excel & "reports"</b>'
    input.criteria[0].evidence[0].excerpt = '<script>steal()</script>'
    input.criteria[2].label = '<img src=x onerror=alert(1)>'
    const html = employerAdvisoryEmailSection(input, partialQuality())
    expect(html).toContain('&lt;b&gt;Excel &amp; &quot;reports&quot;&lt;/b&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('steal()')
    expect(html).not.toContain('<b>Excel')
    expect(presentationText(html)).toContain('5/10')
    expect(presentationText(html)).toContain('Partial assessment')
  })

  it('keeps adversarially long labels compact without truncating their meaning into a new claim', () => {
    const input = job()
    for (const criterion of input.criteria) criterion.label = `${criterion.weight}: ` + '<&'.repeat(400)
    const html = employerAdvisoryEmailSection(input, fullQuality())
    expect(html).toContain('Job requirement 1')
    expect(html).toContain('Job requirement 3')
    expect(html.length).toBeLessThan(3000)
    expect(html).not.toContain('&lt;&amp;')
  })

  it.each([null, undefined, 'bad', [], { status: 'scored' }, { ...job(), criteria: null }, { ...job(), supportedPoints: 101 }])('handles corrupt optional reports without failing baseline rendering: %j', input => {
    const html = employerAdvisoryEmailSection(input, { status: 'assessed', dimensions: null })
    expect(html).toContain('No score was assigned.')
    expect(presentationText(html)).toContain('Not assessed')
    expect(html).not.toContain('<li>')
    expect(html.length).toBeLessThan(1500)
  })

  it.each([NaN, Infinity, -Infinity, -1, 101, 99.99, '100', '<img src=x onerror=alert(1)>'])('rejects invalid or inconsistent presentation totals rather than displaying a score: %j', supportedPoints => {
    const html = employerAdvisoryEmailSection(job(), { ...fullQuality(), supportedPoints })
    expect(presentationText(html)).toContain('Not assessed')
    expect(presentationText(html)).not.toMatch(/\d\/10|NaN|Infinity|supported points|Partial assessment/)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
    expect(html).toContain('70/100')
  })

  it('has one human-review note, no invented details link and no unconditional attachment claim', () => {
    const html = employerAdvisoryEmailSection(job(), fullQuality())
    expect(html.match(/Advisory only\. Verify against the original résumé; you make the decision\./g)).toHaveLength(1)
    expect(html).not.toContain('href=')
    expect(html).not.toContain('<a ')
    expect(html).not.toMatch(/attached|attachment|View details|Read more/i)
    expect(html).not.toMatch(/recommend (?:hiring|rejecting)|candidate quality|grammar score/i)
  })

  it('keeps both legacy detailed exports compatible', () => {
    expect(screeningEmailSection(job())).toContain('Job-specific résumé screening')
    expect(screeningEmailSection(job())).toContain('AI-assessed')
    expect(resumeDocumentQualityEmailSection(partialQuality())).toContain('50/50 observable document-presentation points')
  })
})
