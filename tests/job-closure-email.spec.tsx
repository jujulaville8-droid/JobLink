import { expect, it } from 'vitest'
import { buildEmailHtml } from '@/lib/email-templates'

const data = { applicant_name: 'Maya', job_title: 'Chef', company_name: 'Island Kitchen' }

it('renders the closure update, first name and up to four linked roles with company and location', () => {
  const suggested_jobs = Array.from({ length: 5 }, (_, i) => ({
    title: `Role ${i}`, company: `Company ${i}`, location: 'St. John’s', url: `https://joblinkantigua.com/jobs/${i}`,
  }))
  const { subject, html } = buildEmailHtml('job_closed_applicant', { ...data, suggested_jobs })
  expect(subject).toBe('Update on your application for Chef at Island Kitchen')
  for (const copy of ['Hi Maya', 'Chef', 'Island Kitchen', 'no longer available', 'listing has been closed on JobLink',
    'has contacted the candidates', 'you were not selected for this role this time', 'New roles are added every week',
    'Open roles you may want to apply to next', '#0d7377', 'href="https://joblinkantigua.com/jobs"']) expect(html).toContain(copy)
  for (let i = 0; i < 4; i++) {
    expect(html).toContain(`href="https://joblinkantigua.com/jobs/${i}"`)
    expect(html).toContain(`Role ${i}`)
    expect(html).toContain(`Company ${i}`)
  }
  expect(html).toContain('St. John’s')
  expect(html).not.toContain('Role 4')
  expect(subject + html).not.toMatch(/\u2014|&mdash;|&#8212;|&#x2014;/i)
})

it.each([undefined, []])('omits the entire suggestions section when suggestions are %s', suggested_jobs => {
  const { html } = buildEmailHtml('job_closed_applicant', { ...data, suggested_jobs })
  expect(html).not.toContain('Open roles you may want to apply to next')
  expect(html).toContain('browse all current jobs on JobLink')
})

it('escapes supplied labels and normalizes em dashes without HTML-encoding the subject', () => {
  const { subject, html } = buildEmailHtml('job_closed_applicant', {
    applicant_name: '<Maya>', job_title: 'Chef — Kitchen', company_name: 'A & B',
    suggested_jobs: [{ title: '<Cook> — full time', company: 'A & B', location: '<Town>', url: 'https://joblinkantigua.com/jobs/1' }],
  })
  expect(subject).toBe('Update on your application for Chef, Kitchen at A & B')
  expect(html).toContain('&lt;Maya&gt;')
  expect(html).toContain('&lt;Cook&gt;')
  expect(html).toContain('&lt;Town&gt;')
  expect(html).toContain('A &amp; B')
  expect(html).not.toMatch(/\u2014|&mdash;/)
})

it('renders the employer closure summary and the standard post-role link', () => {
  const { subject, html } = buildEmailHtml('job_closed_employer', { ...data, applicant_count: 12 })
  expect(subject).toBe('Your listing for Chef has been closed')
  for (const copy of ['Your Listing Has Been Closed', 'Chef', 'Island Kitchen', 'has been closed on JobLink',
    'All 12 applicants were notified by email', 'position is no longer available', 'has contacted the candidates it is moving forward with',
    'Similar open roles were suggested to them', 'Nothing further is needed from you', 'Post another role on JobLink',
    '#0d7377', 'href="https://joblinkantigua.com/post-job"']) expect(html).toContain(copy)
  expect(subject + html).not.toMatch(/\u2014|&mdash;|&#8212;|&#x2014;/i)
})

it('escapes employer summary labels and removes their em dashes without encoding the subject', () => {
  const { subject, html } = buildEmailHtml('job_closed_employer', {
    job_title: '<Chef> — A & B', company_name: '<Hotel> — Kitchen', applicant_count: 0,
  })
  expect(subject).toBe('Your listing for <Chef>, A & B has been closed')
  expect(html).toContain('&lt;Chef&gt;, A &amp; B')
  expect(html).toContain('&lt;Hotel&gt;, Kitchen')
  expect(html).toContain('All 0 applicants')
  expect(subject + html).not.toMatch(/\u2014|&mdash;|&#8212;|&#x2014;/i)
})
