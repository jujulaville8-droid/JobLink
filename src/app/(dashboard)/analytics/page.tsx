import DailyPlot from '@/components/EmployerAnalyticsDailyPlot';
import AnalyticsFilters from '@/components/AnalyticsFilters';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getEmployerAnalytics } from '@/lib/employer-analytics';

const card = 'rounded-2xl border border-border bg-surface p-5';
const control = 'rounded-lg border border-border bg-surface p-2 focus-visible:outline-2 focus-visible:outline-primary';

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const days = params.days === '7' ? 7 : 30;
  const data = await getEmployerAnalytics(days);
  if (data.state === 'unauthenticated') redirect('/login');
  if (data.state === 'unverified') redirect('/verify-email');
  if (data.state === 'denied') redirect('/dashboard');
  if (data.state === 'setup') return <section className={card}><h1 className="font-display text-2xl">Set up your company</h1><p>Create your company profile to start using employer analytics.</p><Link href="/company-profile">Company Profile</Link></section>;
  if (data.state === 'error') return <section role="alert" className={card}><h1 className="font-display text-2xl">Analytics unavailable</h1><p>We could not load your analytics. These are not zero counts.</p><Link href={`/analytics?days=${days}`}>Retry analytics</Link></section>;
  const status = typeof params.status === 'string' && ['active', 'pending', 'closed', 'draft'].includes(params.status) ? params.status : 'all';
  const sort = params.sort === 'applications' ? 'applications' : 'newest';
  const filtered = data.rows.filter(row => status === 'all' || row.status === status).sort((a, b) =>
    (sort === 'applications' ? b.periodApplications - a.periodApplications : Date.parse(b.created_at) - Date.parse(a.created_at)) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(Number(params.page)) ? Number(params.page) : 1));
  const pageHref = (n: number) => `/analytics?days=${days}&status=${status}&sort=${sort}&page=${n}`;
  const views = data.views;
  const stats = [['Applications in period', data.applications], ['All-time applications', data.allApplications], ['Active listings now', data.inventory.active], ['Current interviews in period cohort', data.statuses.interview]];
  return <main className="space-y-6 text-text">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-display text-3xl">Analytics</h1><p className="text-text-light">{data.companyName} · Data through {new Date(data.period.end).toLocaleString('en-GB', { timeZone: 'America/Antigua' })} (Antigua)</p></div><Link href="/post-job" className={`${control} bg-primary text-white`}>Post a Job</Link></header>
    <AnalyticsFilters key={`period-${days}`} className="flex flex-wrap items-end gap-3"><label>Period<select name="days" defaultValue={days} className={`${control} ml-2`}><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label><button className={control}>Update period</button></AnalyticsFilters>
    <p className="text-sm text-text-muted">Calendar days in America/Antigua, including partial today. Applications count retained application rows, not unique people. Deletions can change historical totals.</p>
    {data.rows.length === 0 && <section className={card}><h2 className="font-display text-xl">Your analytics starts with a listing</h2><p>Post your first job to begin receiving applications.</p><div className="mt-3 flex flex-wrap gap-4"><Link href="/post-job">Post a Job</Link><Link href="/company-profile">Company Profile</Link></div></section>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(([label, value]) => <section className={card} key={label}><h2 className="text-sm text-text-light">{label}</h2><p className="mt-2 text-3xl font-semibold">{value}</p></section>)}</div>
    {data.rows.length > 0 && data.applications === 0 && <p>No applications received in this period.</p>}
    <div className="grid gap-6 lg:grid-cols-2"><div className="space-y-6"><DailyPlot title="Applications over time" daily={data.daily} />
      {views && <section className="space-y-3"><p>Recorded detail views since {new Date(views.launch).toLocaleString('en-GB', { timeZone: 'America/Antigua' })} (Antigua). Earlier history is not recorded.</p>
        {views.state === 'available' ? <><p className="font-semibold">Recorded views in period: {views.total}</p><DailyPlot title="Recorded views over time" daily={views.daily} partialDays={views.partialDays} /></> : <p role="status">Views unavailable — please retry later.</p>}
        <p className="text-sm text-text-muted">Approximate detail exposures, once per listing per browser tab session. New tabs may count again; blocked scripts or requests undercount. Some views are not recorded when request limits are reached. These are not unique visitors. Without session storage, reloads may count again.</p>
      </section>}
    </div><section className={card}><h2 className="font-display text-xl">Listing inventory (now)</h2><p className="text-sm text-text-light">Current snapshot, independent of the selected period. Active counts include closure overrides and may differ from dashboard totals.</p><dl className="mt-4 space-y-3">{Object.entries(data.inventory).map(([label, value]) => <div key={label} className="flex justify-between"><dt className="capitalize">{label}</dt><dd>{value}</dd></div>)}</dl></section></div>
    <section className={card}><h2 className="font-display text-xl">Listing performance</h2><AnalyticsFilters key={`${days}-${status}-${sort}`} className="my-4 flex flex-wrap items-end gap-3"><input type="hidden" name="days" value={days} /><label>Table only: status<select name="status" defaultValue={status} className={`${control} ml-2`}>{['all', 'active', 'pending', 'closed', 'draft'].map(s => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}</select></label><label>Sort<select name="sort" defaultValue={sort} className={`${control} ml-2`}><option value="newest">Newest first</option><option value="applications">Applications in period</option></select></label><button className={control}>Update table</button></AnalyticsFilters>
      <div role="region" aria-label="Listing performance table" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr>{['Title', 'Status', 'Age', 'Applications (period)', 'Applications (all time)', ...(views ? ['Recorded views (period)'] : []), 'Action'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead><tbody>{filtered.slice((page - 1) * 20, page * 20).map(row => <tr key={row.id} className="border-t border-border"><th scope="row" className="p-2 font-medium">{row.title}</th><td className="p-2">{row.status}{row.closure && <p>Closure override: {row.closure}</p>}</td><td className="p-2">Created {row.age} days ago</td><td className="p-2">{row.periodApplications}</td><td className="p-2">{row.allApplications}</td>{views && <td className="p-2">{views.state === 'available' ? views.perJob[row.id] ?? 0 : '— (unavailable)'}</td>}<td className="p-2"><Link className="text-primary underline" href={row.status === 'draft' ? `/post-job?draft=${row.id}` : `/my-listings/${row.id}/applicants`}>{row.status === 'draft' ? 'Resume draft' : 'Review applicants'}</Link></td></tr>)}</tbody></table></div>
      {filtered.length === 0 && <p>No listings match this table filter.</p>}<nav aria-label="Listing table pages" className="mt-4 flex gap-4">{page > 1 && <Link href={pageHref(page - 1)}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link href={pageHref(page + 1)}>Next</Link>}</nav>
    </section>
    <section className={card}><h2 className="font-display text-xl">Current status of applications received in this period</h2><p className="text-sm text-text-light">Current statuses of the period cohort, not status changes or sequential conversion stages. Hold does not mean hired.</p><dl className="mt-4 space-y-3">{Object.entries(data.statuses).filter(([key, value]) => key !== 'unknown' || value > 0).map(([key, value]) => <div key={key}><div className="flex justify-between"><dt className="capitalize">{key === 'unknown' ? 'Legacy / unknown' : key}</dt><dd>{value} of {data.applications}</dd></div><div aria-hidden="true" className="h-2 rounded bg-bg-alt"><div className="h-2 rounded bg-primary" style={{ width: `${data.applications ? value / data.applications * 100 : 0}%` }} /></div></div>)}</dl></section>
    <section className={card}><h2 className="font-display text-xl">Listing conversations</h2>{data.messages.state === 'available' ? <p>Sent: {data.messages.sent} · Received: {data.messages.received}</p> : <p>Message counts unavailable — please retry later.</p>}<p className="text-sm text-text-light">Messages in this period in accessible listing conversations, including archived threads. Sent counts include automated status messages.</p><Link className="text-primary underline" href="/messages">Open Inbox</Link></section>
  </main>;
}
