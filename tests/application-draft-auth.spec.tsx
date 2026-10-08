import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import { readApplicationDraft, saveApplicationDraft } from '@/lib/application-drafts';

const events = vi.hoisted(() => ({ callback: null as ((event: string, session: { user: User } | null) => void) | null }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: {
    onAuthStateChange: (callback: typeof events.callback) => {
      events.callback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
    getSession: async () => ({ data: { session: null } }),
  },
  from() {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
    return query;
  },
}) }));

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const JOB = '33333333-3333-4333-8333-333333333333';
const session = (id: string) => ({ user: { id, user_metadata: {}, email_confirmed_at: '2026-10-01T00:00:00Z' } as User });
function Identity() { const { user } = useAuth(); return <p>{user?.id ?? 'signed out'}</p>; }

beforeEach(() => { events.callback = null; localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

it('removes saved drafts when the real AuthProvider receives SIGNED_OUT', async () => {
  saveApplicationDraft(USER, JOB, 'Private cover letter');
  localStorage.setItem('another-feature', 'keep');
  render(<AuthProvider><Identity /></AuthProvider>);
  await act(async () => { events.callback?.('INITIAL_SESSION', session(USER)); });
  expect(readApplicationDraft(USER, JOB)).not.toBeNull();
  await act(async () => { events.callback?.('SIGNED_OUT', null); });
  expect(screen.getByText('signed out')).toBeTruthy();
  expect(readApplicationDraft(USER, JOB)).toBeNull();
  expect(localStorage.getItem('another-feature')).toBe('keep');
});

it('cleans previous-account drafts when the authenticated account changes', async () => {
  saveApplicationDraft(USER, JOB, 'First user text');
  render(<AuthProvider><Identity /></AuthProvider>);
  await act(async () => { events.callback?.('INITIAL_SESSION', session(USER)); });
  expect(readApplicationDraft(USER, JOB)).not.toBeNull();
  await act(async () => { events.callback?.('SIGNED_IN', session(OTHER)); });
  expect(screen.getByText(OTHER)).toBeTruthy();
  expect(readApplicationDraft(USER, JOB)).toBeNull();
});

it('clears old drafts when a new visit has no authenticated session', async () => {
  saveApplicationDraft(USER, JOB, 'Old signed-in text');
  render(<AuthProvider><Identity /></AuthProvider>);
  await act(async () => { events.callback?.('INITIAL_SESSION', null); });
  expect(readApplicationDraft(USER, JOB)).toBeNull();
});
