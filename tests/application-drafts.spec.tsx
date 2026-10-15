import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import ApplicationDraftControls from '@/components/ApplicationDraftControls';
import {
  APPLICATION_DRAFT_LIFETIME_MS, cleanApplicationDrafts, deleteApplicationDraft,
  readApplicationDraft, saveApplicationDraft,
} from '@/lib/application-drafts';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const JOB = '33333333-3333-4333-8333-333333333333';
const OTHER_JOB = '44444444-4444-4444-8444-444444444444';
const NOW = Date.parse('2026-10-08T18:00:00Z');

function Editor({ initial = '', userId = USER, jobId = JOB }: { initial?: string; userId?: string; jobId?: string }) {
  const [text, setText] = useState(initial);
  return <><label>Cover letter<textarea value={text} onChange={e => setText(e.target.value)} /></label>
    <ApplicationDraftControls userId={userId} jobId={jobId} coverLetter={text} onResume={setText} />
  </>;
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

function denyStorageMethod(method: 'setItem' | 'removeItem') {
  const actual = window.localStorage;
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue(new Proxy(actual, {
    get(target, property) {
      if (property === method) return () => { throw new DOMException('Storage unavailable'); };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }));
}

it('does not persist typing or automatically restore a saved cover letter', () => {
  const first = render(<Editor />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Private unfinished cover letter' } });
  expect(localStorage.length).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Save draft on this device' }));
  expect(readApplicationDraft(USER, JOB)?.coverLetter).toBe('Private unfinished cover letter');
  expect(screen.getByRole('status').textContent).toContain('It has not been submitted');
  first.unmount();
  render(<Editor />);
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Resume draft' }));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Private unfinished cover letter');
});

it('keeps unsaved edits until explicit replacement is confirmed and deletion keeps form text', () => {
  saveApplicationDraft(USER, JOB, 'Earlier saved letter');
  render(<Editor initial="New unsaved letter" />);
  const confirmation = vi.fn().mockReturnValue(false);
  vi.stubGlobal('confirm', confirmation);
  fireEvent.click(screen.getByRole('button', { name: 'Resume draft' }));
  expect(confirmation).toHaveBeenCalledOnce();
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('New unsaved letter');
  confirmation.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Resume draft' }));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Earlier saved letter');
  fireEvent.click(screen.getByRole('button', { name: 'Delete saved draft' }));
  expect(readApplicationDraft(USER, JOB)).toBeNull();
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Earlier saved letter');
  expect(screen.queryByRole('button', { name: 'Resume draft' })).toBeNull();
});

it('separates drafts by both user and job and stores no unauthenticated identifier', () => {
  expect(saveApplicationDraft(USER, JOB, 'Job one', NOW)).toBe(true);
  expect(saveApplicationDraft(USER, OTHER_JOB, 'Job two', NOW)).toBe(true);
  expect(readApplicationDraft(USER, JOB, NOW)?.coverLetter).toBe('Job one');
  expect(readApplicationDraft(USER, OTHER_JOB, NOW)?.coverLetter).toBe('Job two');
  expect(readApplicationDraft(OTHER_USER, JOB, NOW)).toBeNull();
  expect(saveApplicationDraft('', JOB, 'Anonymous', NOW)).toBe(false);
  expect(saveApplicationDraft(USER, '../another-job', 'Wrong job', NOW)).toBe(false);
});

it('expires drafts without extending retention on reads and preserves unrelated browser storage', () => {
  saveApplicationDraft(USER, JOB, 'Time-limited cover letter', NOW);
  localStorage.setItem('unrelated-preference', 'keep');
  expect(readApplicationDraft(USER, JOB, NOW + APPLICATION_DRAFT_LIFETIME_MS - 1)?.savedAt).toBe(NOW);
  expect(readApplicationDraft(USER, JOB, NOW + APPLICATION_DRAFT_LIFETIME_MS)).toBeNull();
  expect(cleanApplicationDrafts(USER, NOW + APPLICATION_DRAFT_LIFETIME_MS)).toBe(true);
  expect(localStorage.length).toBe(1);
  expect(localStorage.getItem('unrelated-preference')).toBe('keep');
});

it.each(['malformed', 'wrong-user', 'wrong-job', 'future', 'oversize', 'version', 'extended-expiry'])(
  'discards %s stored data rather than exposing it as a draft', kind => {
    saveApplicationDraft(USER, JOB, 'Original', NOW);
    const key = localStorage.key(0)!;
    const value = JSON.parse(localStorage.getItem(key)!);
    if (kind === 'wrong-user') value.userId = OTHER_USER;
    if (kind === 'wrong-job') value.jobId = OTHER_JOB;
    if (kind === 'future') { value.savedAt = NOW + 120000; value.expiresAt = value.savedAt + APPLICATION_DRAFT_LIFETIME_MS; }
    if (kind === 'oversize') value.coverLetter = 'x'.repeat(2001);
    if (kind === 'version') value.version = 99;
    if (kind === 'extended-expiry') value.expiresAt += 1;
    localStorage.setItem(key, kind === 'malformed' ? '{invalid' : JSON.stringify(value));
    expect(readApplicationDraft(USER, JOB, NOW)).toBeNull();
    cleanApplicationDrafts(USER, NOW);
    expect(localStorage.getItem(key)).toBeNull();
  },
);

it('clears other accounts on account change and all feature drafts on sign-out', () => {
  saveApplicationDraft(USER, JOB, 'First account', NOW);
  saveApplicationDraft(OTHER_USER, JOB, 'Second account', NOW);
  localStorage.setItem('other-feature', 'keep');
  cleanApplicationDrafts(OTHER_USER, NOW);
  expect(readApplicationDraft(USER, JOB, NOW)).toBeNull();
  expect(readApplicationDraft(OTHER_USER, JOB, NOW)?.coverLetter).toBe('Second account');
  cleanApplicationDrafts(null, NOW);
  expect(readApplicationDraft(OTHER_USER, JOB, NOW)).toBeNull();
  expect(localStorage.getItem('other-feature')).toBe('keep');
});

it('handles unavailable storage without losing typed text or falsely reporting success', () => {
  render(<Editor initial="Keep this text" />);
  denyStorageMethod('setItem');
  fireEvent.click(screen.getByRole('button', { name: 'Save draft on this device' }));
  expect(screen.getByRole('alert').textContent).toContain('could not save');
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Keep this text');
  expect(screen.queryByRole('status')).toBeNull();
});

it('reports failed deletion and keeps the stored draft available', () => {
  saveApplicationDraft(USER, JOB, 'Stored text');
  render(<Editor />);
  denyStorageMethod('removeItem');
  fireEvent.click(screen.getByRole('button', { name: 'Delete saved draft' }));
  expect(screen.getByRole('alert').textContent).toContain('could not delete');
  expect(screen.getByRole('button', { name: 'Resume draft' })).toBeTruthy();
});

it('rejects empty and oversized saves without changing a previous valid draft', () => {
  saveApplicationDraft(USER, JOB, 'Saved text', NOW);
  expect(saveApplicationDraft(USER, JOB, '  ', NOW)).toBe(false);
  expect(saveApplicationDraft(USER, JOB, 'x'.repeat(2001), NOW)).toBe(false);
  expect(readApplicationDraft(USER, JOB, NOW)?.coverLetter).toBe('Saved text');
  expect(deleteApplicationDraft(USER, JOB)).toBe(true);
  expect(readApplicationDraft(USER, JOB, NOW)).toBeNull();
});
