'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, CalendarDays, Check, ChevronDown, ChevronRight, FileText, Search, SlidersHorizontal } from 'lucide-react'
import {
  APPLICATION_STATUS_LABELS, APPLICATION_TIME_ZONE, UUID_PATTERN, applicantName, applicationStatusLabel,
  defaultApplicationDates, parseApplicantQuery, parseOverviewQuery,
  type ApplicationFilterOptions, type ApplicationOverview, type JobApplicants,
} from '@/lib/admin-applications'
import ApplicationDetailDrawer from './ApplicationDetailDrawer'
import AdminApplicationsSession from './AdminApplicationsSession'
import { useApplicationRead } from './useApplicationRead'
import styles from './ApplicationsWorkspace.module.css'

const OVERVIEW_PATH = '/admin/applications'
const DAY = 86_400_000
const number = new Intl.NumberFormat('en-AG')
const dayFormatter = new Intl.DateTimeFormat('en-AG', { month: 'short', day: 'numeric', timeZone: APPLICATION_TIME_ZONE })
const dateFormatter = new Intl.DateTimeFormat('en-AG', { month: 'short', day: 'numeric', year: 'numeric', timeZone: APPLICATION_TIME_ZONE })
function dateLabel(value: string, long = false) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value)
  return Number.isFinite(date.getTime()) ? (long ? dateFormatter : dayFormatter).format(date) : 'Date unavailable'
}
function queryString(values: Record<string, string | number | null>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== '') params.set(key, String(value))
  return params.toString()
}
function href(path: string, params: URLSearchParams) { return `${path}${params.size ? `?${params.toString()}` : ''}` }

function ReadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className={styles.notice} role="alert"><p>{message}</p><button type="button" className={styles.secondaryButton} onClick={retry}>Try again</button></div>
}
function Loading({ text = 'Loading applications…' }: { text?: string }) {
  return <div className={styles.loading} role="status"><span className={styles.loadingDot} aria-hidden="true" />{text}</div>
}

function Pagination({ page, limit, total, onPage, label }: { page: number; limit: number; total: number; onPage: (page: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  return <nav className={styles.pagination} aria-label={label}>
    <p>{total && page <= pages ? `${number.format((page - 1) * limit + 1)}–${number.format(Math.min(page * limit, total))} of ${number.format(total)}` : total ? `0 on this page · ${number.format(total)} total` : '0 results'}<span> · Page {number.format(page)} of {number.format(pages)}</span></p>
    <div><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ArrowLeft size={16} aria-hidden="true" />Previous</button>
      <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<ArrowRight size={16} aria-hidden="true" /></button></div>
  </nav>
}

function EntityFilter({ kind, selected, companyId, onChange }: { kind: 'company' | 'job'; selected: string | null; companyId: string | null; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const details = useRef<HTMLDetailsElement>(null)
  const plural = kind === 'company' ? 'companies' : 'jobs'
  const label = kind === 'company' ? 'Company' : 'Job'
  const url = open ? `/api/admin/applications/filters?${queryString({ kind, q: search, page, limit: 10, companyId: kind === 'job' ? companyId : null })}` : null
  const read = useApplicationRead<ApplicationFilterOptions>(url)
  function choose(id: string | null) {
    onChange(id)
    if (details.current) { details.current.open = false; details.current.querySelector('summary')?.focus() }
  }
  return <details className={styles.entityFilter} ref={details} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className={selected ? styles.filterSelected : ''}>{kind === 'company' ? <Building2 size={16} aria-hidden="true" /> : <BriefcaseBusiness size={16} aria-hidden="true" />}{label}{selected ? ' · Filtered' : ''}<ChevronDown size={14} aria-hidden="true" /></summary>
    <div className={styles.filterPanel}>
      <form onSubmit={event => { event.preventDefault(); setSearch(String(new FormData(event.currentTarget).get('lookup') ?? '').trim()); setPage(1) }}>
        <label htmlFor={`lookup-${kind}`}>Search {plural}</label><div className={styles.inputRow}>
          <input id={`lookup-${kind}`} name="lookup" type="search" maxLength={160} placeholder={`Find ${kind === 'company' ? 'a company' : 'a job'}`} />
          <button type="submit" aria-label={`Search ${plural}`}><Search size={17} aria-hidden="true" /></button>
        </div>
      </form>
      <button type="button" className={styles.option} onClick={() => choose(null)} aria-pressed={!selected}>All {plural}{!selected ? <Check size={16} aria-hidden="true" /> : null}</button>
      {read.loading ? <Loading text={`Loading ${plural}…`} /> : read.error ? <ReadError message={read.error} retry={read.retry} /> : read.data ? <>
        <div className={styles.optionList}>{read.data.items.length ? read.data.items.map(item => <button type="button" className={styles.option} key={item.id} aria-pressed={selected === item.id} onClick={() => choose(item.id)}>{item.name}{selected === item.id ? <Check size={16} aria-hidden="true" /> : null}</button>) : <p className={styles.muted}>No matching {plural}.</p>}</div>
        <div className={styles.lookupPagination}><button type="button" disabled={page === 1} aria-label={`Previous ${plural}`} onClick={() => setPage(value => value - 1)}>Previous</button><span>{page}</span><button type="button" disabled={page * read.data.limit >= read.data.totalCount} aria-label={`More ${plural}`} onClick={() => setPage(value => value + 1)}>More</button></div>
      </> : null}
    </div>
  </details>
}

function ActivityChart({ data }: { data: ApplicationOverview }) {
  const max = Math.max(1, ...data.trend.map(point => point.count))
  const width = Math.max(600, data.trend.length * 22)
  const chartWidth = width - 48
  const step = chartWidth / Math.max(1, data.trend.length)
  const tickInterval = Math.max(1, Math.ceil(data.trend.length / 7))
  return <section className={styles.card} aria-labelledby="activity-heading">
    <div className={styles.cardHeading}><div><h2 id="activity-heading">Application activity</h2><p>Daily submissions · Antigua time (UTC−4)</p></div><span className={styles.chartLegend}><i aria-hidden="true" />Applications</span></div>
    {data.summary.applications === 0 ? <p className={styles.zeroNote}>No applications in this date range with the selected filters.</p> : null}
    <div className={styles.chartScroll} role="region" aria-label="Daily applications chart" tabIndex={0}>
      <svg viewBox={`0 0 ${width} 200`} width={width} height={200} className={styles.chart} role="img" aria-label={`${number.format(data.summary.applications)} applications from ${dateLabel(data.scope.from, true)} to ${dateLabel(data.scope.to, true)}. Daily values are available in the table below.`}>
        <line x1="34" x2={width - 8} y1="158" y2="158" stroke="#e8e3db" />
        <line x1="34" x2={width - 8} y1="24" y2="24" stroke="#e8e3db" strokeDasharray="3 4" />
        <text x="22" y="162" textAnchor="end" className={styles.axis}>0</text><text x="22" y="28" textAnchor="end" className={styles.axis}>{number.format(max)}</text>
        {data.trend.map((point, index) => {
          const height = point.count / max * 122
          const x = 38 + index * step
          return <g key={point.date}>
            <rect x={x} y={158 - height} width={Math.max(2, Math.min(26, step - 5))} height={height} rx="3" fill="#0d7377"><title>{dateLabel(point.date, true)}: {number.format(point.count)} applications</title></rect>
            {point.count && data.trend.length <= 31 ? <text x={x + Math.min(26, step - 5) / 2} y={151 - height} textAnchor="middle" className={styles.barValue}>{point.count}</text> : null}
            {index % tickInterval === 0 || index === data.trend.length - 1 ? <text x={x + Math.min(26, step - 5) / 2} y="184" textAnchor={index === data.trend.length - 1 ? 'end' : 'middle'} className={styles.axis}>{dateLabel(point.date)}</text> : null}
          </g>
        })}
      </svg>
    </div>
    <details className={styles.chartData}><summary>View daily counts</summary><div className={styles.dailyTable}><table><caption>Applications submitted each day, matching the current filters</caption><thead><tr><th scope="col">Date</th><th scope="col">Applications</th></tr></thead><tbody>{data.trend.map(point => <tr key={point.date}><th scope="row">{dateLabel(point.date, true)}</th><td>{number.format(point.count)}</td></tr>)}</tbody></table></div></details>
  </section>
}

type WorkspaceProps = { jobId?: string; initialDates?: { from: string; to: string } }

export default function ApplicationsWorkspace(props: WorkspaceProps) {
  return <AdminApplicationsSession><ApplicationsWorkspaceContent {...props} /></AdminApplicationsSession>
}

function ApplicationsWorkspaceContent({ jobId, initialDates }: WorkspaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [defaults] = useState(() => initialDates ?? defaultApplicationDates())
  const params = new URLSearchParams(searchParams.toString())
  if (!params.has('from') && !params.has('to')) { params.set('from', defaults.from); params.set('to', defaults.to) }
  const overviewResult = parseOverviewQuery(params)
  const applicantResult = parseApplicantQuery(params)
  const overviewQuery = overviewResult.value
  const applicantQuery = applicantResult.value
  const invalidJob = !!jobId && !UUID_PATTERN.test(jobId)
  const queryError = invalidJob ? 'This job is unavailable.' : jobId ? applicantResult.error : overviewResult.error
  const apiUrl = queryError ? null : jobId && applicantQuery ? `/api/admin/applications/jobs/${jobId}/applicants?${queryString({ ...applicantQuery })}` : overviewQuery ? `/api/admin/applications/overview?${queryString({ ...overviewQuery })}` : null
  const read = useApplicationRead<ApplicationOverview | JobApplicants>(apiUrl)
  const overview = !jobId ? read.data as ApplicationOverview | null : null
  const applicants = jobId ? read.data as JobApplicants | null : null
  const selectedApplication = params.get('application')
  const applicationId = selectedApplication && UUID_PATTERN.test(selectedApplication) ? selectedApplication : null
  const from = (jobId ? applicantQuery?.from : overviewQuery?.from) ?? defaults.from
  const to = (jobId ? applicantQuery?.to : overviewQuery?.to) ?? defaults.to
  const status = (jobId ? applicantQuery?.status : overviewQuery?.status) ?? 'all'
  const defaultRange = to === defaults.to ? String((Date.parse(to) - Date.parse(from)) / DAY + 1) : 'custom'
  const preset = ['7', '30', '90'].includes(defaultRange) ? defaultRange : 'custom'
  const formKey = `${from}:${to}:${params.toString()}`

  function navigate(changes: Record<string, string | number | null>, options: { replace?: boolean; resetPage?: boolean } = {}) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (options.resetPage !== false) next.delete(jobId ? 'applicantPage' : 'page')
    if (!Object.hasOwn(changes, 'application')) next.delete('application')
    const destination = href(pathname, next)
    if (options.replace) router.replace(destination, { scroll: false })
    else router.push(destination, { scroll: false })
  }
  const backParams = new URLSearchParams(params)
  for (const key of ['application', 'applicantQ', 'applicantSort', 'applicantPage', 'applicantLimit']) backParams.delete(key)
  function jobHref(id: string) { return href(`${OVERVIEW_PATH}/${id}`, backParams) }
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget).get('search') ?? '').trim()
    navigate({ [jobId ? 'applicantQ' : 'q']: value })
  }
  function reset() {
    if (!jobId) { router.replace(href(pathname, new URLSearchParams(defaults)), { scroll: false }); return }
    const next = new URLSearchParams(backParams)
    next.set('from', defaults.from)
    next.set('to', defaults.to)
    next.delete('status')
    router.replace(href(pathname, next), { scroll: false })
  }

  return <div className={styles.workspace}>
    {jobId ? <Link className={styles.backLink} href={href(OVERVIEW_PATH, backParams)}><ArrowLeft size={16} aria-hidden="true" />Back to applications</Link> : null}
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Admin workspace</p><h1>{jobId ? 'Applicants' : 'Applications'}</h1><p className={styles.intro}>{jobId ? applicants ? `${applicants.job.title} · ${applicants.job.company.name}` : 'Applications for this job' : 'A clearer view of every opportunity.'}</p></div>
      <div className={styles.dates}><label htmlFor="application-date-range"><CalendarDays size={16} aria-hidden="true" />Application dates</label>
        <select id="application-date-range" value={preset} onChange={event => { if (event.target.value !== 'custom') navigate({ from: new Date(Date.parse(`${defaults.to}T00:00:00Z`) - (Number(event.target.value) - 1) * DAY).toISOString().slice(0, 10), to: defaults.to }); else document.getElementById('application-custom-dates')?.setAttribute('open', '') }}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom dates</option></select>
        <details id="application-custom-dates" className={styles.customDates}><summary>{dateLabel(from)} – {dateLabel(to)}<ChevronDown size={13} aria-hidden="true" /></summary><form key={`${from}:${to}`} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); navigate({ from: String(data.get('from') ?? ''), to: String(data.get('to') ?? '') }); event.currentTarget.closest('details')?.removeAttribute('open') }}><label>From<input type="date" name="from" defaultValue={from} required /></label><label>To<input type="date" name="to" defaultValue={to} required /></label><p>Inclusive dates · Antigua time · up to 366 days</p><button type="submit" className={styles.primaryButton}>Apply dates</button></form></details>
      </div>
    </header>

    <p className={styles.scope}>Submitted {dateLabel(from, true)} – {dateLabel(to, true)} · Antigua time (UTC−4){status !== 'all' ? ` · Current status: ${applicationStatusLabel(status)}` : ''}</p>
    {queryError ? <div className={styles.notice} role="alert"><p>{queryError}</p><button type="button" className={styles.secondaryButton} onClick={reset}>Reset filters</button></div> : null}
    {selectedApplication && !applicationId ? <div role="alert" className={styles.notice}>This application link is invalid.<button type="button" onClick={() => navigate({ application: null }, { replace: true, resetPage: false })}>Dismiss</button></div> : null}

    {!jobId && overview ? <>
      <div className={styles.metrics} role="group" aria-label="Application summary">
        <div className={styles.metric}><span className={styles.metricIcon}><FileText size={20} aria-hidden="true" /></span><div><p>Applications</p><strong>{number.format(overview.summary.applications)}</strong></div></div>
        <div className={styles.metric}><span className={styles.metricIcon}><BriefcaseBusiness size={20} aria-hidden="true" /></span><div><p>Jobs with applicants</p><strong>{number.format(overview.summary.jobsWithApplications)}</strong></div></div>
        <div className={styles.metric}><span className={`${styles.metricIcon} ${styles.gold}`}><BriefcaseBusiness size={20} aria-hidden="true" /></span><div><p>Jobs without applicants</p><strong>{number.format(overview.totalJobs - overview.summary.jobsWithApplications)}</strong></div></div>
      </div>
      <ActivityChart data={overview} />
    </> : null}

    <section className={styles.card} aria-labelledby="application-list-heading" aria-busy={read.loading}>
      <div className={styles.cardHeading}><div><h2 id="application-list-heading">{jobId ? 'Applicants for this job' : 'Applications by job'}</h2><p>{jobId ? 'Select an applicant to view their application.' : 'All matching jobs, including those without applicants in this date range.'}</p></div>{jobId && applicants ? <span className={styles.resultCount}>{number.format(applicants.totalCount)} applications</span> : null}</div>
      <div className={styles.filters}>
        <form key={formKey} className={styles.searchForm} onSubmit={search}><label className={styles.srOnly} htmlFor="application-search">{jobId ? 'Search applicants' : 'Search jobs or companies'}</label><Search size={17} aria-hidden="true" /><input id="application-search" name="search" type="search" maxLength={160} defaultValue={jobId ? applicantQuery?.applicantQ ?? '' : overviewQuery?.q ?? ''} placeholder={jobId ? 'Search applicants' : 'Search jobs or companies'} /><button type="submit" aria-label="Apply search">Search</button></form>
        <div className={styles.filterControls}>
          {!jobId ? <><EntityFilter kind="company" selected={overviewQuery?.companyId ?? null} companyId={null} onChange={id => navigate({ companyId: id, jobId: null })} /><EntityFilter key={overviewQuery?.companyId ?? 'all'} kind="job" selected={overviewQuery?.jobId ?? null} companyId={overviewQuery?.companyId ?? null} onChange={id => navigate({ jobId: id })} /></> : null}
          <label className={styles.selectControl}><span>Current application status</span><select aria-label="Current application status" value={status} onChange={event => navigate({ status: event.target.value })}><option value="all">All application statuses</option>{Object.entries(APPLICATION_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          {!jobId ? <label className={styles.selectControl}><span>Job status</span><select aria-label="Job status" value={overviewQuery?.jobStatus ?? 'all'} onChange={event => navigate({ jobStatus: event.target.value })}><option value="all">All job statuses</option><option value="active">Active</option><option value="closed">Closed</option><option value="pending_approval">Pending approval</option></select></label> : null}
          <button type="button" className={styles.resetButton} onClick={reset}><SlidersHorizontal size={14} aria-hidden="true" />Reset filters</button>
        </div>
      </div>
      <div className={styles.listTools}><p>{jobId ? 'Application dates and current statuses' : 'Counts reflect the application dates and current statuses above.'}</p><label><span className={styles.srOnly}>{jobId ? 'Sort applicants' : 'Sort jobs'}</span><select aria-label={jobId ? 'Sort applicants' : 'Sort jobs'} value={jobId ? applicantQuery?.applicantSort ?? 'newest' : overviewQuery?.sort ?? 'latest'} onChange={event => navigate({ [jobId ? 'applicantSort' : 'sort']: event.target.value })}>{jobId ? <><option value="newest">Newest applicants</option><option value="oldest">Oldest applicants</option><option value="name">Applicant name</option></> : <><option value="latest">Latest application</option><option value="applications_desc">Most applications</option><option value="applications_asc">Fewest applications</option><option value="job_asc">Job title A–Z</option><option value="company_asc">Company A–Z</option><option value="newest_job">Newest jobs</option></>}</select></label></div>
      {read.loading ? <Loading /> : read.error ? <ReadError message={read.error} retry={read.retry} /> : overview ? <>
        {overview.jobs.length ? <div className={styles.tableWrap}><table className={styles.jobsTable}><thead><tr><th scope="col">Job / Company</th><th scope="col">Applications</th><th scope="col">Latest application</th><th scope="col"><span className={styles.srOnly}>View applicants</span></th></tr></thead><tbody>{overview.jobs.map(job => <tr key={job.id}><td><Link className={styles.jobLink} href={jobHref(job.id)}>{job.title}</Link><span className={styles.companyName}>{job.company.name}</span><span className={styles.jobStatus}>{job.status === 'pending_approval' ? 'Pending approval' : job.status === 'active' ? 'Active' : job.status === 'closed' ? 'Closed' : 'Status unavailable'}</span></td><td data-label="Applications"><span className={styles.countBadge}>{number.format(job.applicationCount)}</span></td><td data-label="Latest application" className={styles.latest}>{job.latestApplicationAt ? <time dateTime={job.latestApplicationAt}>{dateLabel(job.latestApplicationAt, true)}</time> : 'No applicants in range'}</td><td><Link className={styles.rowAction} href={jobHref(job.id)} aria-label={`View applicants for ${job.title} at ${job.company.name}`}><span>View applicants</span><ChevronRight size={18} aria-hidden="true" /></Link></td></tr>)}</tbody></table></div> : <div className={styles.empty}><BriefcaseBusiness size={28} aria-hidden="true" /><h3>{overview.totalJobs ? 'No jobs on this page' : 'No jobs match these filters'}</h3><p>{overview.totalJobs ? 'Return to the first page to see matching jobs.' : 'Try another search or clear a filter. Jobs with no applicants are included.'}</p><button type="button" className={styles.secondaryButton} onClick={() => overview.totalJobs ? navigate({ page: 1 }, { resetPage: false }) : reset()}>{overview.totalJobs ? 'First page' : 'Reset filters'}</button></div>}
        <Pagination page={overview.page} limit={overview.limit} total={overview.totalJobs} onPage={page => navigate({ page }, { resetPage: false })} label="Jobs pagination" />
      </> : applicants ? <>
        {applicants.applications.length ? <ul className={styles.applicantList}>{applicants.applications.map(application => <li key={application.id}><button type="button" className={`${styles.applicantButton} ${applicationId === application.id ? styles.selectedApplicant : ''}`} onClick={() => navigate({ application: application.id }, { resetPage: false })} aria-label={`View application from ${applicantName(application.applicant)}`}><span className={styles.initials} aria-hidden="true">{[application.applicant.firstName, application.applicant.lastName].filter(Boolean).map(name => name!.trim().charAt(0)).join('').slice(0, 2) || '—'}</span><span className={styles.applicantIdentity}><strong>{applicantName(application.applicant)}</strong><span>Applied <time dateTime={application.appliedAt}>{dateLabel(application.appliedAt, true)}</time></span></span><span className={styles.statusBadge}>{applicationStatusLabel(application.status)}</span><ChevronRight size={18} aria-hidden="true" /></button></li>)}</ul> : <div className={styles.empty}><FileText size={28} aria-hidden="true" /><h3>{applicants.totalCount ? 'No applicants on this page' : 'No applicants in this view'}</h3><p>{applicants.totalCount ? 'Return to the first page to see matching applicants.' : 'This job has no applications matching the selected dates, search and current status.'}</p><button type="button" className={styles.secondaryButton} onClick={() => applicants.totalCount ? navigate({ applicantPage: 1 }, { resetPage: false }) : reset()}>{applicants.totalCount ? 'First page' : 'Reset filters'}</button></div>}
        <Pagination page={applicants.page} limit={applicants.limit} total={applicants.totalCount} onPage={applicantPage => navigate({ applicantPage }, { resetPage: false })} label="Applicants pagination" />
      </> : null}
    </section>
    <p className={styles.privacyNote}>Admin access only. Résumés reflect the applicant’s current profile. Employer notification delivery is not tracked.</p>
    {jobId ? <ApplicationDetailDrawer applicationId={applicationId} jobId={jobId} onClose={() => navigate({ application: null }, { replace: true, resetPage: false })} /> : null}
    <noscript><p className={styles.notice}>JavaScript is needed to load this private Applications workspace and its filters. Your applications remain unchanged.</p></noscript>
  </div>
}
