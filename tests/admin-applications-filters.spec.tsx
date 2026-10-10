import { describe, expect, it } from 'vitest'
import {
  APPLICATION_TIME_ZONE, applicationScope, applicationStatusLabel, applicantName,
  defaultApplicationDates, parseApplicantQuery, parseFilterQuery, parseOverviewQuery,
} from '@/lib/admin-applications'

const now = new Date('2026-10-08T12:00:00Z')
const query = (text = '') => new URLSearchParams(text)

describe('admin application scope and filters', () => {
  it('defaults to 30 inclusive calendar days in Antigua, including the UTC day boundary', () => {
    expect(defaultApplicationDates(now)).toEqual({ from: '2026-09-09', to: '2026-10-08' })
    expect(defaultApplicationDates(new Date('2026-10-08T03:59:59Z'))).toEqual({ from: '2026-09-08', to: '2026-10-07' })
    expect(defaultApplicationDates(new Date('2026-10-08T04:00:00Z'))).toEqual({ from: '2026-09-09', to: '2026-10-08' })
    expect(parseOverviewQuery(query(), now)).toEqual({ value: {
      from: '2026-09-09', to: '2026-10-08', q: '', companyId: null, jobId: null,
      status: 'all', jobStatus: 'all', sort: 'latest', page: 1, limit: 20,
    } })
  })

  it.each([
    'from=2026-10-08', 'to=2026-10-08',
    'from=2026-02-30&to=2026-03-01', 'from=2026-13-01&to=2026-13-02',
    'from=0000-01-01&to=0000-01-02', 'from=not-a-date&to=2026-10-08',
    'from=2026-10-09&to=2026-10-08', 'from=2024-01-01&to=2025-01-01',
    'from=2026-10-08&from=2026-10-07&to=2026-10-08',
  ])('rejects invalid or ambiguous date scope: %s', text => {
    expect(parseOverviewQuery(query(text), now).error).toBeTruthy()
    expect(parseApplicantQuery(query(text), now).error).toBeTruthy()
  })

  it.each(['from=2024-01-01&to=2024-12-31', 'from=2026-10-08&to=2026-10-08'])('accepts inclusive leap-year and single-day scopes: %s', text => {
    expect(parseOverviewQuery(query(text), now).error).toBeUndefined()
  })

  it.each([
    'status=hired', 'status=on_hold', 'status=unread', 'jobStatus=approved', 'sort=title desc;drop table users',
    'page=0', 'page=-1', 'page=1.1', 'page=10001', 'page=1e3', 'page=1%0A', 'limit=20%0A', 'limit=51', 'limit=0',
    'companyId=not-a-uuid', 'jobId=not-a-uuid', 'companyId=11111111-1111-4111-8111-111111111111%0A',
    'jobId=11111111-1111-4111-8111-111111111111%0A', 'q=one&q=two', 'status=applied&status=interview', `q=${'a'.repeat(161)}`,
  ])('rejects invalid or ambiguous filters: %s', text => {
    expect(parseOverviewQuery(query(text), now).error).toBeTruthy()
  })

  it('keeps search literal and parses the approved current status and complete scope', () => {
    const params = query('from=2026-10-01&to=2026-10-08&companyId=11111111-1111-4111-8111-111111111111&jobId=22222222-2222-4222-8222-222222222222&status=hold&jobStatus=active&sort=applications_desc&page=3&limit=50')
    params.set('q', '  50% _ team,(west)  ')
    const result = parseOverviewQuery(params, now)
    if (!result.value) throw new Error(result.error)
    expect(result.value).toEqual({
      from: '2026-10-01', to: '2026-10-08', q: '50% _ team,(west)',
      companyId: '11111111-1111-4111-8111-111111111111', status: 'hold', jobStatus: 'active',
      sort: 'applications_desc', page: 3, limit: 50, jobId: '22222222-2222-4222-8222-222222222222',
    })
    expect(applicationScope(result.value)).toEqual({ from: '2026-10-01', to: '2026-10-08', timeZone: APPLICATION_TIME_ZONE })
  })

  it('keeps applicant pagination/search independent from the preserved overview URL', () => {
    const params = query('from=2026-10-01&to=2026-10-08&q=Chef&sort=company_asc&page=8&limit=50&status=interview&applicantQ=Taylor&applicantSort=oldest&applicantPage=2&applicantLimit=10')
    const result = parseApplicantQuery(params, now)
    if (!result.value) throw new Error(result.error)
    expect(result.value).toEqual({
      from: '2026-10-01', to: '2026-10-08', status: 'interview', applicantQ: 'Taylor',
      applicantSort: 'oldest', applicantPage: 2, applicantLimit: 10,
    })
    const defaults = parseApplicantQuery(query('q=Chef&sort=company_asc&page=8&limit=50'), now)
    expect(defaults.value?.applicantQ).toBe('')
    expect(defaults.value?.applicantPage).toBe(1)
    expect(defaults.value?.applicantLimit).toBe(20)
  })

  it.each(['applicantSort=random', 'applicantPage=0', 'applicantLimit=100', 'applicantQ=a&applicantQ=b'])('rejects invalid applicant filters: %s', text => {
    expect(parseApplicantQuery(query(text), now).error).toBeTruthy()
  })

  it('limits minimal filter lookups and validates filter kind', () => {
    expect(parseFilterQuery(query())).toEqual({ value: { kind: 'company', q: '', companyId: null, page: 1, limit: 20 } })
    expect(parseFilterQuery(query('kind=job&q=Chef&page=2&limit=10')).value).toMatchObject({ kind: 'job', q: 'Chef', page: 2, limit: 10 })
    expect(parseFilterQuery(query('kind=users')).error).toBeTruthy()
    expect(parseFilterQuery(query('limit=500')).error).toBeTruthy()
    expect(parseFilterQuery(query('companyId=bad')).error).toBeTruthy()
  })

  it('labels real current statuses without inventing review or hiring states', () => {
    expect(applicationStatusLabel('hold')).toBe('On Hold')
    expect(applicationStatusLabel('hired')).toBe('Status unavailable')
    expect(applicationStatusLabel('unread')).toBe('Status unavailable')
    expect(applicantName({ firstName: null, lastName: null })).toBe('Name unavailable')
  })
})
