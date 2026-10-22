import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import TermsPage from '../src/app/terms/page'
import ApplicantScreeningNotice from '../src/components/ApplicantScreeningNotice'
import { hasCurrentScreeningNotice, hasNarrativeReviewNotice, SCREENING_NOTICE_VERSION, SCREENING_NOTICE_TEXT, SCREENING_TERMS_HREF } from '../src/lib/employer-screening/notice'

afterEach(cleanup)
describe('default-OFF applicant processing disclosure draft', () => {
  it('requires the new truthful disclosure for broader narrative review, without rejecting old baseline forms', () => {
    expect(hasNarrativeReviewNotice(SCREENING_NOTICE_VERSION)).toBe(true)
    for (const prior of ['resume-advisory-terms-link-v2', 'resume-advisory-notice-v1']) {
      expect(hasCurrentScreeningNotice(prior)).toBe(true)
      expect(hasNarrativeReviewNotice(prior)).toBe(false)
    }
    expect(hasNarrativeReviewNotice(undefined)).toBe(false)
  })
  it('does not publish the draft notice by default', () => {
    const { container } = render(<ApplicantScreeningNotice />)
    expect(container.textContent).toBe('')
  })
  it('renders a compact versioned terms link instead of a separate disclosure box', () => {
    const { container } = render(<ApplicantScreeningNotice visible />)
    const link = screen.getByRole('link', { name: /Terms of Service, including résumé review/ })
    expect(link.getAttribute('href')).toBe(SCREENING_TERMS_HREF)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(container.querySelector('[data-screening-notice-version]')?.getAttribute('data-screening-notice-version')).toBe(SCREENING_NOTICE_VERSION)
    expect(container.textContent).toContain('By submitting, you agree to our')
    expect(container.querySelector('aside, h3, input')).toBeNull()
    expect(container.textContent).not.toContain(SCREENING_NOTICE_TEXT)
  })
  it('provides the full transparent disclosure at the exact linked terms section', () => {
    render(<TermsPage />)
    const section = screen.getByRole('region', { name: '3.1 Résumé Review and Automated Processing' })
    expect(`#${section.id}`).toBe(SCREENING_TERMS_HREF.split('/terms')[1])
    expect(section.textContent).toContain(SCREENING_NOTICE_TEXT)
    for (const text of ['AI using OpenAI', 'minimized job-related evidence', 'AI may also provide a separate text-based assessment', 'reports and scores are shared only with the employer', 'Missing or uncertain evidence is not a failed requirement', 'employer makes all hiring decisions', 'does not automatically reject or hide']) {
      expect(section.textContent).toContain(text)
    }
    expect(section.textContent).not.toMatch(/human review|\d+\/\d+|supported points|candidate quality/i)
  })
  it('does not treat missing, stale or truthy notice values as the reviewed version', () => {
    expect(hasCurrentScreeningNotice(SCREENING_NOTICE_VERSION)).toBe(true)
    // An in-flight form can truthfully attest to the old, fully displayed notice.
    expect(hasCurrentScreeningNotice('resume-advisory-notice-v1')).toBe(true)
    for (const value of [null, undefined, true, 1, 'true', 'old-version', 'resume-advisory-terms-link-v1', {}]) expect(hasCurrentScreeningNotice(value)).toBe(false)
  })
})
