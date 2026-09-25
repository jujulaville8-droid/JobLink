import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AlertsPage from '@/app/(dashboard)/alerts/page';

vi.mock('@/components/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'owner', email: 'owner@example.com' }, isLoading: false }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: 'profile' } }), order: async () => ({ data: [] }) }; return q; } }) }));
let records: Record<string, unknown>[];
let failSave: boolean;
beforeEach(() => {
  records = []; failSave = false;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    if (!init?.method || init.method === 'GET') return Response.json({ alerts: records, email: 'owner@example.com' });
    if (failSave) return Response.json({ error: 'Unable to save. Try again.' }, { status: 503 });
    const body = JSON.parse(init.body);
    if (init.method === 'DELETE') { records = records.filter(r => r.id !== body.id); return Response.json({ success: true }); }
    const alert = { ...body, id: body.id || 'alert-1', created_at: '2026-09-24T12:00:00Z' };
    records = [...records.filter(r => r.id !== alert.id), alert];
    return Response.json({ alert });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('saves typed keywords without an extra Add action, edits and confirms deletion', async () => {
  render(<AlertsPage />);
  await screen.findByRole('button', { name: /new alert/i });
  fireEvent.click(screen.getByRole('button', { name: /new alert/i }));
  fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: ' Chef, chef , cook ' } });
  fireEvent.click(screen.getByRole('button', { name: /^save alert$/i }));
  await waitFor(() => expect(records[0]?.keywords).toEqual(['chef', 'cook']));
  fireEvent.click(await screen.findByRole('button', { name: /edit alert/i }));
  fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: 'receptionist' } });
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  await waitFor(() => expect(records).toHaveLength(1));
  await waitFor(() => expect(records[0]?.keywords).toEqual(['receptionist']));
  fireEvent.click(await screen.findByRole('button', { name: /delete alert/i }));
  expect(records).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));
  await waitFor(() => expect(records).toHaveLength(0));
});

it('preserves the form and displays an actionable error when saving fails', async () => {
  render(<AlertsPage />);
  fireEvent.click(await screen.findByRole('button', { name: /new alert/i }));
  fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: 'chef' } });
  failSave = true;
  fireEvent.click(screen.getByRole('button', { name: /^save alert$/i }));
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to save');
  expect((screen.getByLabelText(/keywords/i) as HTMLInputElement).value).toBe('chef');
});
