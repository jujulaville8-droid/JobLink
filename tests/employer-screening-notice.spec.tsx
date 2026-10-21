import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ApplicantScreeningNotice from '../src/components/ApplicantScreeningNotice'
import { hasCurrentScreeningNotice, SCREENING_NOTICE_VERSION } from '../src/lib/employer-screening/notice'

afterEach(cleanup)
describe('default-OFF applicant processing disclosure draft', () => {
  it('does not publish the draft notice by default', () => {
    const { container } = render(<ApplicantScreeningNotice />)
    expect(container.textContent).toBe('')
  })
  it('discloses AI and independent document assessment without exposing employer reports', () => {
    render(<ApplicantScreeningNotice visible />)
    const note = screen.getByRole('note', { name: 'Application processing notice' })
    expect(note.textContent).toContain('processed with AI')
    expect(note.textContent).toContain('shared only with the employer')
    expect(note.textContent).toContain('does not automatically reject or hide')
    expect(note.textContent).not.toMatch(/\d+\/\d+|supported points|candidate quality/i)
    expect(note.getAttribute('data-screening-notice-version')).toBe(SCREENING_NOTICE_VERSION)
  })
  it('does not treat missing, stale or truthy notice values as the reviewed version', () => {
    expect(hasCurrentScreeningNotice(SCREENING_NOTICE_VERSION)).toBe(true)
    for (const value of [null, undefined, true, 1, 'true', 'old-version', {}]) expect(hasCurrentScreeningNotice(value)).toBe(false)
  })
})
