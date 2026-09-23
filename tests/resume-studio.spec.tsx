import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResumeStudio from '@/components/cv/studio/ResumeStudio';
import { resumeFixture } from './fixtures/resume';

let stored = structuredClone(resumeFixture);
let failSave = false;
let failLoad = false;
beforeEach(() => {
  sessionStorage.clear();
  stored = structuredClone(resumeFixture); failSave = false; failLoad = false;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method) return Response.json(failLoad ? { error: 'Could not load your resume.' } : stored, { status: failLoad ? 503 : 200 });
    if (failSave) return Response.json({ error: 'Save failed. Your draft is still here.' }, { status: 503 });
    const body = JSON.parse(String(init.body));
    if (body.section === 'profile') { stored.profile = { ...stored.profile, ...body.entry }; return Response.json({ success: true, entry: stored.profile }); }
    const row = { ...body.entry, id: body.id, cv_profile_id: 'cv-1', sort_order: body.sort_order ?? 0 };
    return Response.json({ success: true, entry: row });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('premium resume workspace', () => {
  it('recovers unsaved edits after leaving and reopening the workspace in the same tab', async () => {
    const first = render(<ResumeStudio />);
    fireEvent.change(await screen.findByLabelText('Professional summary'), { target: { value: 'Recover this unsaved summary' } });
    first.unmount();
    render(<ResumeStudio />);
    await waitFor(() => expect((screen.getByLabelText('Professional summary') as HTMLTextAreaElement).value).toBe('Recover this unsaved summary'));
    expect(screen.getByRole('status').textContent).toContain('Unsaved changes');
  });
  it('clears the recovered draft after a confirmed save', async () => {
    const user = userEvent.setup(); const first = render(<ResumeStudio />);
    fireEvent.change(await screen.findByLabelText('Professional summary'), { target: { value: 'Saved, not a stale draft' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('All changes saved'));
    first.unmount(); render(<ResumeStudio />);
    await screen.findByLabelText('Professional summary');
    expect(screen.getByRole('status').textContent).toContain('All changes saved');
  });
  it('shows the saved document and updates the live preview as the summary changes', async () => {
    render(<ResumeStudio />);
    await screen.findByRole('heading', { name: 'Your professional story' });
    const summary = screen.getByLabelText('Professional summary');
    fireEvent.change(summary, { target: { value: 'A stronger, honest summary.' } });
    expect(within(screen.getByRole('region', { name: 'Live resume preview' })).getByText('A stronger, honest summary.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Unsaved changes');
  });
  it('retains the draft on failure and only reports saved after an accepted save', async () => {
    const user = userEvent.setup(); render(<ResumeStudio />);
    const summary = await screen.findByLabelText('Professional summary');
    fireEvent.change(summary, { target: { value: 'My new summary' } });
    failSave = true;
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((summary as HTMLTextAreaElement).value).toBe('My new summary');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('status').textContent).not.toContain('All changes saved');
    failSave = false;
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('All changes saved'));
    expect(stored.profile.summary).toBe('My new summary');
  });
  it('keeps unsaved edits when navigating between sections', async () => {
    const user = userEvent.setup(); render(<ResumeStudio />);
    fireEvent.change(await screen.findByLabelText('Professional summary'), { target: { value: 'Keep this draft' } });
    await user.click(screen.getByRole('button', { name: /^Work experience/ }));
    await user.click(screen.getByRole('button', { name: /^Summary/ }));
    expect((screen.getByLabelText('Professional summary') as HTMLTextAreaElement).value).toBe('Keep this draft');
  });
  it('undoes and redoes local edits without touching saved data', async () => {
    const user = userEvent.setup(); render(<ResumeStudio />);
    fireEvent.change(await screen.findByLabelText('Professional summary'), { target: { value: 'New summary' } });
    await user.click(screen.getByRole('button', { name: 'Undo edit' }));
    expect((screen.getByLabelText('Professional summary') as HTMLTextAreaElement).value).toBe(resumeFixture.profile.summary);
    await user.click(screen.getByRole('button', { name: 'Redo edit' }));
    expect((screen.getByLabelText('Professional summary') as HTMLTextAreaElement).value).toBe('New summary');
  });
  it('offers retry on load failure rather than showing an empty resume', async () => {
    const user = userEvent.setup(); failLoad = true; render(<ResumeStudio />);
    await screen.findByRole('alert');
    expect(screen.queryByLabelText('Professional summary')).toBeNull();
    failLoad = false; await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Professional summary')).toBeTruthy();
  });
  it('edits existing records and previews a new role without replacing saved roles', async () => {
    const user = userEvent.setup(); render(<ResumeStudio />);
    await screen.findByLabelText('Professional summary');
    await user.click(screen.getByRole('button', { name: /^Work experience/ }));
    expect((screen.getByLabelText('Job title *') as HTMLInputElement).value).toBe('Guest Services Supervisor');
    await user.click(screen.getByRole('button', { name: 'Add role' }));
    fireEvent.change(screen.getByLabelText('Job title *'), { target: { value: 'Guest Relations Lead' } });
    expect(within(screen.getByRole('region', { name: 'Live resume preview' })).getByText('Guest Relations Lead')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Live resume preview' })).getByText('Guest Services Supervisor', { selector: 'strong' })).toBeTruthy();
  });
});
