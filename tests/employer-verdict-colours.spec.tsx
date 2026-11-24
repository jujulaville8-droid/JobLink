import { afterEach, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import ApplicationScreeningVerdict from '../src/components/ApplicationScreeningVerdict'
import { INSUFFICIENT_FIT, simpleFitEmailText, type SimpleFitVerdict } from '../src/lib/employer-screening/simple-fit'
import { buildEmailHtml } from '../src/lib/email-templates'
import { NOT_SCREENED_TEXT, applicationScreeningLine } from '../src/lib/employer-screening/not-screened'

const application = { applied_at: '2026-11-16', employer_forward_status: 'sent' }
afterEach(cleanup)

it.each([
  ['good_fit', 'emerald', '700', '#ecfdf5', '#a7f3d0', '#047857'],
  ['not_a_fit', 'red', '700', '#fef2f2', '#fecaca', '#b91c1c'],
  ['not_enough_information', 'amber', '800', '#fffbeb', '#fde68a', '#92400e'],
] as const)('renders %s with the correct dashboard and email colours and unchanged text', (verdict, colour, shade, background, border, textColour) => {
  const result: SimpleFitVerdict = { ...INSUFFICIENT_FIT, verdict }
  const text = simpleFitEmailText(result)
  const { container } = render(<ApplicationScreeningVerdict application={application} recorded={{ verdict, text }} />)
  const box = container.querySelector('p')!
  expect(box.textContent).toBe(text)
  expect(box.classList.contains(`bg-${colour}-50`)).toBe(true)
  expect(box.classList.contains(`border-${colour}-200`)).toBe(true)
  expect(box.classList.contains(`text-${colour}-${shade}`)).toBe(true)
  expect(box.classList.contains('bg-primary/5')).toBe(false)
  const html = buildEmailHtml('new_applicant', { employer_fit_verdict: result }).html
  expect(html).toContain(text)
  expect(html).toContain(`background:${background};color:${textColour};border:1px solid ${border}`)
})

it.each([
  undefined,
  ...Object.values(NOT_SCREENED_TEXT).map(text => ({ verdict: 'not_screened', text })),
  { verdict: 'unavailable', text: 'Fit check unavailable.' },
  { verdict: 'unknown', text: 'Unknown outcome' },
  { verdict: 'good_fit', text: '' },
])('keeps missing or non-verdict outcomes neutral: %j', recorded => {
  const { container } = render(<ApplicationScreeningVerdict application={application} recorded={recorded} />)
  const box = container.querySelector('p')!
  expect(box.textContent).toBe(applicationScreeningLine(application, recorded?.text))
  expect(box.classList.contains('bg-primary/5')).toBe(true)
  expect(box.className).not.toMatch(/(?:emerald|red|amber)-/)
})

it('keeps unavailable email verdicts neutral', () => {
  const html = buildEmailHtml('new_applicant', { employer_fit_verdict: { ...INSUFFICIENT_FIT, verdict: 'unavailable' } }).html
  expect(html).toContain('background:#f8fafc;color:#475569;border:1px solid #cbd5e1')
})
