'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Briefcase, Users } from 'lucide-react';
import type { ClientShortlistEntry, ShortlistProgress } from '@/lib/shortlist/ranking';
import CandidatePanel from './CandidatePanel';
import VerdictChip from './VerdictChip';
import { ActionButtons, Avatar, candidateName, chipSkills, formatApplied, NewMarker, SavedMarker, useShortlistActions } from './shared';

export interface JobOption {
  id: string;
  title: string;
}

/** Mobile swipe-to-review: one candidate card at a time, in ranked order. */
export default function MobileReview({
  jobId,
  jobs,
  entries,
  progress,
}: {
  jobId: string;
  jobs: JobOption[];
  entries: ClientShortlistEntry[];
  progress: ShortlistProgress;
}) {
  const router = useRouter();
  const actions = useShortlistActions();
  const [index, setIndex] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const touchStart = useRef<number | null>(null);

  const current = entries.length ? entries[Math.min(index, entries.length - 1)] : null;
  const position = current ? entries.indexOf(current) : 0;
  const strongFits = entries.filter(e => e.group === 'good_fit').length;
  const pct = progress.total > 0 ? Math.round((progress.reviewed / progress.total) * 100) : 0;

  const go = (delta: number) => setIndex(i => Math.max(0, Math.min(entries.length - 1, Math.min(i, entries.length - 1) + delta)));

  return (
    <div className="space-y-4">
      <label className="relative flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3">
        <Briefcase className="h-5 w-5 shrink-0 text-text" aria-hidden="true" />
        <span className="sr-only">Job</span>
        <select
          value={jobId}
          onChange={e => router.push(`/my-listings/${e.target.value}/shortlist`)}
          className="w-full appearance-none bg-transparent text-base font-semibold text-text focus:outline-none"
        >
          {jobs.map(job => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
      </label>

      {strongFits > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">
          <Users className="h-5 w-5" aria-hidden="true" />
          <p className="font-semibold">
            {strongFits} strong {strongFits === 1 ? 'fit' : 'fits'} waiting
          </p>
        </div>
      )}

      <div>
        <p className="text-sm text-text-light">
          Reviewed {progress.reviewed} of {progress.total}
        </p>
        <div
          className="mt-2 h-2 w-full rounded-full bg-bg-alt"
          role="progressbar"
          aria-label="Review progress"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.reviewed}
        >
          <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {current ? (
        <>
          <article
            className="rounded-2xl border border-border bg-white p-5 shadow-md"
            onTouchStart={e => {
              touchStart.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={e => {
              const start = touchStart.current;
              const end = e.changedTouches[0]?.clientX;
              touchStart.current = null;
              if (start == null || end == null) return;
              if (end - start > 60) go(-1);
              else if (start - end > 60) go(1);
            }}
          >
            <div className="flex items-start gap-3">
              <Avatar entry={current} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-text">{candidateName(current)}</h2>
                <p className="text-sm text-text-light">Applied {formatApplied(current.application.applied_at)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {current.isNew && <NewMarker />}
                  {current.isPinned && <SavedMarker />}
                </div>
              </div>
            </div>

            {current.matchedSkills.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-text-light">Matched skills</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {chipSkills({ ...current, otherSkills: [] }).map(skill => (
                    <span key={skill} className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary-dark">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {current.verdict?.verdict_text && <p className="mt-4 text-base text-text">{current.verdict.verdict_text}</p>}

            <div className="mt-4 flex items-center justify-between gap-3">
              <VerdictChip verdict={current.verdict?.verdict} />
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="text-sm font-semibold text-primary"
              >
                View profile
              </button>
            </div>
          </article>

          <div className="flex items-center justify-between px-4">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={position === 0}
              aria-label="Previous candidate"
              className="rounded-full p-2 text-text-light disabled:opacity-30"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-sm text-text-light">Swipe to review</span>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={position >= entries.length - 1}
              aria-label="Next candidate"
              className="rounded-full p-2 text-text-light disabled:opacity-30"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>

          <ActionButtons entry={current} actions={actions} />

          {panelOpen && <CandidatePanel entry={current} actions={actions} onClose={() => setPanelOpen(false)} />}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center text-sm text-text-muted">
          No candidates in the shortlist yet.
        </div>
      )}
    </div>
  );
}
