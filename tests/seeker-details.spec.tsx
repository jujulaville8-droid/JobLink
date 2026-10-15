import { describe, expect, it } from 'vitest'
import {
  matchesApplicantDetails,
} from '@/lib/admin-applications'
import {
  parseSeekerDetails, parseSensitiveDetails, seekerDetailRows, seekerDetailsFromRow, sensitiveDetailRows, EMPTY_SEEKER_DETAILS,
} from '@/lib/seeker-details'

describe('seeker details validation', () => {
  it('accepts partial answers and normalizes lists', () => {
    const result = parseSeekerDetails({
      currently_employed: null, has_own_transport: true, availability: ['shifts', 'shifts', 'weekends'],
      languages: [' English ', 'english', '', 'Spanish'], notice_period: '', earliest_start_date: '2026-11-01',
    })
    expect(result).toEqual({ ok: true, value: {
      currently_employed: null, has_own_transport: true, availability: ['shifts', 'weekends'],
      languages: ['English', 'Spanish'], notice_period: null, earliest_start_date: '2026-11-01',
    } })
  })

  it.each([
    [{ currently_employed: 'yes' }],
    [{ availability: ['nights'] }],
    [{ notice_period: 'forever' }],
    [{ earliest_start_date: '2026-02-30' }],
    [{ languages: 'English' }],
    [{ marital_status: 'single' }],
    [{ certifications: Array.from({ length: 31 }, (_, i) => `Cert ${i}`) }],
  ])('rejects %j', input => {
    expect(parseSeekerDetails(input).ok).toBe(false)
  })

  it('validates sensitive details separately', () => {
    expect(parseSensitiveDetails({ marital_status: 'married', children_count: 2 })).toEqual({ ok: true, value: { marital_status: 'married', children_count: 2 } })
    expect(parseSensitiveDetails({ marital_status: '', children_count: null })).toEqual({ ok: true, value: { marital_status: null, children_count: null } })
    for (const bad of [{ marital_status: 'complicated' }, { children_count: -1 }, { children_count: 2.5 }, { children_count: 21 }, { currently_employed: true }]) {
      expect(parseSensitiveDetails(bad).ok).toBe(false)
    }
  })

  it('formats only answered details, and keeps sensitive rows separate', () => {
    const details = seekerDetailsFromRow({ currently_employed: false, availability: ['part_time', 'bogus'], earliest_start_date: '2026-11-01' })
    expect(seekerDetailRows(details)).toEqual([
      { label: 'Currently employed', value: 'No' },
      { label: 'Availability', value: 'Part-time' },
      { label: 'Earliest start date', value: 'November 1, 2026' },
    ])
    expect(seekerDetailRows(EMPTY_SEEKER_DETAILS)).toEqual([])
    expect(seekerDetailRows(details).some(row => /marital|children/i.test(row.label))).toBe(false)
    expect(sensitiveDetailRows({ marital_status: 'prefer_not_to_say', children_count: 0 })).toEqual([
      { label: 'Marital status', value: 'Prefer not to say' }, { label: 'Number of children', value: '0' },
    ])
  })
})

describe('admin applicant detail filters', () => {
  const applicant = (currentlyEmployed: boolean | null, hasOwnTransport: boolean | null = null, availability: string[] = []) =>
    ({ id: 'a', firstName: 'A', lastName: 'B', currentlyEmployed, hasOwnTransport, availability })
  it('filters by employed yes/no/unknown, transport and availability', () => {
    expect(matchesApplicantDetails(applicant(true), { employed: 'yes' })).toBe(true)
    expect(matchesApplicantDetails(applicant(false), { employed: 'yes' })).toBe(false)
    expect(matchesApplicantDetails(applicant(null), { employed: 'no' })).toBe(false)
    expect(matchesApplicantDetails(applicant(null), { employed: 'unknown' })).toBe(true)
    expect(matchesApplicantDetails(applicant(false), { employed: 'unknown' })).toBe(false)
    expect(matchesApplicantDetails(applicant(null, true), { transport: 'yes' })).toBe(true)
    expect(matchesApplicantDetails(applicant(null, null, ['shifts']), { availability: 'shifts' })).toBe(true)
    expect(matchesApplicantDetails(applicant(null, null, ['shifts']), { availability: 'weekends' })).toBe(false)
    expect(matchesApplicantDetails(applicant(null), { employed: 'all', transport: 'all', availability: 'all' })).toBe(true)
  })
})
