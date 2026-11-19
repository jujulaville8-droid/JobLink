'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientShortlistEntry } from '@/lib/shortlist/ranking';

export function candidateName(entry: ClientShortlistEntry): string {
  const s = entry.application.seeker;
  return (s && [s.first_name, s.last_name].filter(Boolean).join(' ').trim()) || 'Unknown applicant';
}

export function initials(entry: ClientShortlistEntry): string {
  const s = entry.application.seeker;
  const value = `${s?.first_name?.trim().charAt(0) ?? ''}${s?.last_name?.trim().charAt(0) ?? ''}`.toUpperCase();
  return value || '?';
}

/** Fixed time zone so server render and hydration agree. */
export function formatApplied(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Antigua' });
}

/** Row chips: matched skills first, then other candidate skills. */
export function chipSkills(entry: ClientShortlistEntry, max = 3): string[] {
  return [...entry.matchedSkills.map(s => s.name), ...entry.otherSkills].slice(0, max);
}

export function Avatar({ entry, size = 'md' }: { entry: ClientShortlistEntry; size?: 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-11 w-11 text-sm';
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary ${dims}`}
    >
      {initials(entry)}
    </div>
  );
}

export function NewMarker() {
  return (
    <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      New
    </span>
  );
}

export function SavedMarker() {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
      Saved
    </span>
  );
}

async function send(url: string, method: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ShortlistActions {
  busy: string | null;
  error: string | null;
  interview: (entry: ClientShortlistEntry) => Promise<boolean>;
  toggleSave: (entry: ClientShortlistEntry) => Promise<boolean>;
  pass: (entry: ClientShortlistEntry) => Promise<boolean>;
  restore: (entry: ClientShortlistEntry) => Promise<boolean>;
}

/**
 * Triage actions. Interview reuses the existing status endpoint so the applicant
 * is notified exactly as from the full applicants list.
 */
export function useShortlistActions(): ShortlistActions {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, work: () => Promise<boolean>): Promise<boolean> {
    if (busy) return false;
    setBusy(key);
    setError(null);
    try {
      const ok = await work();
      if (!ok) setError('That did not save. Please try again.');
      router.refresh();
      return ok;
    } finally {
      setBusy(null);
    }
  }

  const override = (applicationId: string, action: string, method: 'POST' | 'DELETE') =>
    send('/api/shortlist/overrides', method, { applicationId, action });

  return {
    busy,
    error,
    interview: entry =>
      run(`interview:${entry.application.id}`, async () => {
        const ok = await send(`/api/applications/${entry.application.id}/status`, 'PATCH', { status: 'interview' });
        if (!ok) return false;
        await override(entry.application.id, 'interview', 'POST');
        return true;
      }),
    toggleSave: entry =>
      run(`pin:${entry.application.id}`, () => override(entry.application.id, 'pin', entry.isPinned ? 'DELETE' : 'POST')),
    pass: entry => run(`remove:${entry.application.id}`, () => override(entry.application.id, 'remove', 'POST')),
    restore: entry => run(`restore:${entry.application.id}`, () => override(entry.application.id, 'remove', 'DELETE')),
  };
}

export function ActionButtons({
  entry,
  actions,
  onPassed,
  size = 'lg',
}: {
  entry: ClientShortlistEntry;
  actions: ShortlistActions;
  onPassed?: () => void;
  size?: 'lg' | 'sm';
}) {
  const id = entry.application.id;
  const pad = size === 'lg' ? 'py-3 text-base' : 'py-2 text-sm';
  const interviewing = entry.application.status === 'interview';
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => actions.interview(entry)}
        disabled={actions.busy !== null || interviewing}
        className={`w-full rounded-xl bg-primary px-4 font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60 ${pad}`}
      >
        {actions.busy === `interview:${id}` ? 'Saving…' : interviewing ? 'Interview requested' : 'Interview'}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => actions.toggleSave(entry)}
          disabled={actions.busy !== null}
          aria-pressed={entry.isPinned}
          className={`rounded-xl border px-3 font-semibold transition-colors disabled:opacity-60 ${pad} ${
            entry.isPinned ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-white text-text hover:border-primary/40'
          }`}
        >
          {entry.isPinned ? 'Saved' : 'Save for later'}
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = await actions.pass(entry);
            if (ok) onPassed?.();
          }}
          disabled={actions.busy !== null}
          className={`rounded-xl border border-border bg-white px-3 font-semibold text-text transition-colors hover:border-red-300 hover:text-red-700 disabled:opacity-60 ${pad}`}
        >
          Pass
        </button>
      </div>
      {actions.error && (
        <p role="alert" className="text-xs text-red-700">
          {actions.error}
        </p>
      )}
    </div>
  );
}
