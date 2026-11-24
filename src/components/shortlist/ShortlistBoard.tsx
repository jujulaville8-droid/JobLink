'use client';

import { useState } from 'react';
import { SHORTLIST_TOP_N, visibleEntries, type ClientShortlistEntry } from '@/lib/shortlist/ranking';
import CandidatePanel from './CandidatePanel';
import VerdictChip from './VerdictChip';
import { Avatar, candidateName, chipSkills, formatApplied, NewMarker, SavedMarker, useShortlistActions } from './shared';

/** Desktop ranked list with the slide-in candidate panel. */
export default function ShortlistBoard({
  entries,
  passed,
}: {
  entries: ClientShortlistEntry[];
  passed: ClientShortlistEntry[];
}) {
  const actions = useShortlistActions();
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPassed, setShowPassed] = useState(false);
  const selected = entries.find(e => e.application.id === selectedId) ?? null;
  const rows = visibleEntries(entries, expanded);

  if (entries.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-white p-8 text-center">
        <p className="text-sm font-medium text-text">No candidates in the shortlist yet</p>
        <p className="mt-1 text-xs text-text-muted">New applicants appear here as they are screened.</p>
      </div>
    );
  }

  return (
    <div>
      <ol className="space-y-3">
        {rows.map((entry, index) => {
          const isTop = index === 0;
          return (
            <li key={entry.application.id}>
              <button
                type="button"
                onClick={() => setSelectedId(entry.application.id)}
                aria-label={`Open ${candidateName(entry)}`}
                className={`flex w-full items-center gap-4 rounded-card border p-4 text-left transition-shadow hover:shadow-md ${
                  isTop ? 'border-primary/50 bg-primary/[0.04]' : 'border-border bg-white'
                } ${selectedId === entry.application.id ? 'ring-2 ring-primary/40' : ''}`}
              >
                <span className="w-6 shrink-0 text-center font-display text-xl font-semibold text-text">{index + 1}</span>
                <Avatar entry={entry} />
                <div className="w-44 shrink-0">
                  <p className="truncate font-semibold text-text">{candidateName(entry)}</p>
                  <p className="text-xs text-text-light">Applied {formatApplied(entry.application.applied_at)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.isNew && <NewMarker />}
                    {entry.isPinned && <SavedMarker />}
                    {entry.hasInterview && (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Interview
                      </span>
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  {chipSkills(entry).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {chipSkills(entry).map(skill => (
                        <span key={skill} className="rounded-full bg-bg-alt px-2.5 py-0.5 text-xs font-medium text-text">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  {entry.verdict?.verdict_text && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-text">{entry.verdict.verdict_text}</p>
                  )}
                </div>
                <div className="shrink-0 border-l border-border pl-4">
                  <VerdictChip verdict={entry.verdict?.verdict} />
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {entries.length > SHORTLIST_TOP_N && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-4 w-full rounded-xl border border-border bg-white py-2.5 text-sm font-semibold text-primary hover:border-primary/40"
        >
          {expanded ? 'Show less' : `Show all ${entries.length} candidates`}
        </button>
      )}

      {passed.length > 0 && (
        <div className="mt-6 rounded-card border border-border bg-white">
          <button
            type="button"
            onClick={() => setShowPassed(v => !v)}
            aria-expanded={showPassed}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-text-light"
          >
            <span>Passed ({passed.length})</span>
            <span aria-hidden="true">{showPassed ? '−' : '+'}</span>
          </button>
          {showPassed && (
            <ul className="divide-y divide-border border-t border-border">
              {passed.map(entry => (
                <li key={entry.application.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-sm text-text">{candidateName(entry)}</span>
                  <button
                    type="button"
                    onClick={() => actions.restore(entry)}
                    disabled={actions.busy !== null}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-primary hover:border-primary/40 disabled:opacity-60"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selected && <CandidatePanel entry={selected} actions={actions} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
