'use client';

import { useEffect } from 'react';
import { CheckCircle2, Download, Eye, FileText, X } from 'lucide-react';
import MessageButton from '@/components/messaging/MessageButton';
import type { ClientShortlistEntry } from '@/lib/shortlist/ranking';
import VerdictChip from './VerdictChip';
import { ActionButtons, Avatar, candidateName, formatApplied, type ShortlistActions } from './shared';

/**
 * Candidate detail: a right-hand slide-in panel on desktop, a full-screen sheet
 * on mobile. The ranked queue stays mounted underneath.
 */
export default function CandidatePanel({
  entry,
  actions,
  onClose,
}: {
  entry: ClientShortlistEntry;
  actions: ShortlistActions;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const seeker = entry.application.seeker;
  const name = candidateName(entry);
  const cvHref = seeker?.cv_url && seeker.id ? `/api/cv-download?profileId=${encodeURIComponent(seeker.id)}` : null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Candidate profile">
      <button
        type="button"
        aria-label="Close candidate profile"
        onClick={onClose}
        className="absolute inset-0 hidden bg-black/20 md:block"
      />
      <aside className="absolute inset-0 flex flex-col bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-[460px] md:border-l md:border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-primary-dark">Candidate profile</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-text-light hover:bg-bg-alt hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="flex items-start gap-4">
            <Avatar entry={entry} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold text-text">{name}</h3>
                <VerdictChip verdict={entry.verdict?.verdict} />
              </div>
              <p className="mt-0.5 text-xs text-text-muted">Applied {formatApplied(entry.application.applied_at)}</p>
              {seeker?.bio && <p className="mt-2 line-clamp-3 text-sm text-text-light">{seeker.bio}</p>}
            </div>
          </div>

          {entry.verdict?.verdict_text && (
            <p className="rounded-xl bg-primary/5 p-3 text-sm text-text">{entry.verdict.verdict_text}</p>
          )}

          <section>
            <h4 className="text-sm font-semibold text-text">Skills matched to this job</h4>
            {entry.matchedSkills.length > 0 ? (
              <ul className="mt-2 divide-y divide-white overflow-hidden rounded-xl">
                {entry.matchedSkills.map(skill => (
                  <li key={skill.name} className="flex items-center justify-between gap-3 bg-primary/5 px-3 py-2 text-sm font-medium text-text">
                    <span>{skill.name}</span>
                    <span className="flex items-center gap-2">
                      {skill.fromResume && <span className="text-[11px] font-normal text-text-muted">Parsed from resume</span>}
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Matched" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-muted">No listed skills match this job&apos;s description.</p>
            )}
            {entry.otherSkills.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-text-light">Other skills</p>
                <p className="mt-1 text-sm text-text">{entry.otherSkills.join(', ')}</p>
              </div>
            )}
          </section>

          <section>
            <h4 className="text-sm font-semibold text-text">Resume</h4>
            {cvHref ? (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-border p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-text">{name}</p>
                <a
                  href={cvHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text hover:border-primary/40 hover:text-primary"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" /> View
                </a>
                <a
                  href={cvHref}
                  download
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text hover:border-primary/40 hover:text-primary"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
                </a>
              </div>
            ) : (
              <p className="mt-2 text-sm text-text-muted">No resume on file.</p>
            )}
          </section>

          {entry.application.cover_letter_text && (
            <section>
              <h4 className="text-sm font-semibold text-text">Cover letter</h4>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text">{entry.application.cover_letter_text}</p>
            </section>
          )}

          <MessageButton applicationId={entry.application.id} label="Message candidate" />
        </div>

        <div className="border-t border-border bg-white px-5 py-4">
          <ActionButtons entry={entry} actions={actions} onPassed={onClose} />
          <p className="mt-2 text-center text-[11px] text-text-muted">Interview notifies the applicant.</p>
        </div>
      </aside>
    </div>
  );
}
