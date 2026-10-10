'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { ArrowUpRight, FileText } from 'lucide-react';
import { APPLICATION_TIME_ZONE, type ApplicationOverview } from '@/lib/admin-applications';
import AdminApplicationsSession from './AdminApplicationsSession';

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: ApplicationOverview };

export default function AdminApplicationsPreview() {
  return <AdminApplicationsSession><AdminApplicationsPreviewContent /></AdminApplicationsSession>;
}

function AdminApplicationsPreviewContent() {
  const headingId = useId();
  const [state, setState] = useState<PreviewState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/admin/applications/overview?limit=5&sort=latest', {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Application preview unavailable');
        const data = await response.json() as ApplicationOverview;
        if (!controller.signal.aborted) setState({ kind: 'ready', data });
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  const jobs = state.kind === 'ready' ? state.data.jobs.filter(job => job.applicationCount > 0).slice(0, 5) : [];
  const scope = state.kind === 'ready'
    ? new URLSearchParams({ from: state.data.scope.from, to: state.data.scope.to }).toString()
    : '';
  const dateFormat = new Intl.DateTimeFormat('en-AG', { month: 'short', day: 'numeric', timeZone: APPLICATION_TIME_ZONE });

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-2xl border border-border/40 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-5 py-4">
        <div>
          <h2 id={headingId} className="text-sm font-semibold text-text">Recent application activity</h2>
          <p className="mt-1 text-xs text-text-light">Last 30 days · By job</p>
        </div>
        <Link href={`/admin/applications${scope ? `?${scope}` : ''}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          View applications <ArrowUpRight aria-hidden="true" size={15} />
        </Link>
      </div>

      {state.kind === 'loading' && <p role="status" className="px-5 py-7 text-sm text-text-light">Loading recent application activity…</p>}
      {state.kind === 'error' && (
        <div className="px-5 py-6">
          <p role="alert" className="text-sm text-text-light">Couldn&apos;t load recent application activity.</p>
          <button type="button" onClick={() => { setState({ kind: 'loading' }); setAttempt(value => value + 1); }} className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-primary hover:bg-bg-alt">
            Try again
          </button>
        </div>
      )}
      {state.kind === 'ready' && jobs.length === 0 && (
        <p className="px-5 py-7 text-sm text-text-light">No applications in the last 30 days.</p>
      )}
      {state.kind === 'ready' && jobs.length > 0 && (
        <ul className="divide-y divide-border/40">
          {jobs.map(job => (
            <li key={job.id}>
              <Link href={`/admin/applications/${job.id}?${scope}`} className="flex min-h-20 items-center gap-3 px-5 py-3 hover:bg-bg-alt/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary"><FileText size={17} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium text-text">{job.title}</span>
                  <span className="mt-1 block break-words text-xs text-text-light">{job.company.name}{job.latestApplicationAt ? ` · Latest ${dateFormat.format(new Date(job.latestApplicationAt))}` : ''}</span>
                </span>
                <span className="shrink-0 text-right text-sm font-semibold text-primary">{job.applicationCount.toLocaleString()}<span className="mt-0.5 block text-[11px] font-normal text-text-light">{job.applicationCount === 1 ? 'application' : 'applications'}</span></span>
                <ArrowUpRight size={15} className="shrink-0 text-text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
