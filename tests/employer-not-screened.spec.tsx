import { expect, it } from 'vitest'
import { applicationScreeningLine, NOT_SCREENED_TEXT, SCREENING_LAUNCH_AT } from '../src/lib/employer-screening/not-screened'
import { buildEmailHtml } from '../src/lib/email-templates'
import { INSUFFICIENT_FIT, simpleFitEmailText } from '../src/lib/employer-screening/simple-fit'

it('derives historical lines with launch precedence, and treats the launch instant as current', () => {
  expect(applicationScreeningLine({ applied_at: '2026-11-14T21:50:59Z', employer_forward_status: 'not_sent' })).toBe('Not screened: this application arrived before screening was turned on.')
  expect(applicationScreeningLine({ applied_at: SCREENING_LAUNCH_AT, employer_forward_status: 'not_sent' })).toBe('Not screened: this application was not forwarded to the employer.')
  expect(applicationScreeningLine({ applied_at: SCREENING_LAUNCH_AT, employer_forward_status: 'sent' })).toBe(NOT_SCREENED_TEXT.screening_unavailable)
})
it.each([simpleFitEmailText(INSUFFICIENT_FIT), ...Object.values(NOT_SCREENED_TEXT)])('preserves recorded text ahead of any derived reason: %s', recorded => {
  expect(applicationScreeningLine({ applied_at: '2026-11-01', employer_forward_status: 'not_sent' }, recorded)).toBe(recorded)
})
it.each(Object.values(NOT_SCREENED_TEXT))('renders one muted email line: %s', line => {
  const html = buildEmailHtml('new_applicant', { employer_not_screened: line }).html
  expect(html).toContain(line)
  expect(html).toContain('color: #6b7280')
  expect(html.match(/Not screened:/g)).toHaveLength(1)
  expect(html).not.toContain('Tip:')
})
it('keeps real email verdicts ahead of not-screened text and retains the historical empty behavior', () => {
  const html = buildEmailHtml('new_applicant', { employer_fit_verdict: INSUFFICIENT_FIT, employer_not_screened: NOT_SCREENED_TEXT.no_resume }).html
  expect(html).toContain(simpleFitEmailText(INSUFFICIENT_FIT))
  expect(html).not.toContain('Not screened:')
  expect(buildEmailHtml('new_applicant', {}).html).not.toContain('Not screened:')
})
it('escapes not-screened email text', () => {
  expect(buildEmailHtml('new_applicant', { employer_not_screened: '<script>test</script>' }).html).toContain('&lt;script&gt;test&lt;/script&gt;')
})
