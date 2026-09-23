import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PUT, DELETE } from '@/app/api/cv/studio/route';
const boundary = vi.hoisted(() => ({ user: { id: 'user-1', email: 'simone@example.com', email_confirmed_at: '2026-01-01' } as Record<string, unknown> | null, role: 'seeker', read: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: boundary.user }, error: null }) }, from: () => { const q = { select: () => q, eq: () => q, single: async () => ({ data: { role: boundary.role, email_verified: true }, error: null }) }; return q; } }) }));
vi.mock('@/lib/resume-store', () => ({ readResume: boundary.read, saveResumeEntry: boundary.save, deleteResumeEntry: boundary.remove }));
beforeEach(() => { vi.clearAllMocks(); boundary.user = { id: 'user-1', email: 'simone@example.com', email_confirmed_at: '2026-01-01' }; boundary.role = 'seeker'; boundary.save.mockResolvedValue({ id: '3a6d9148-2611-4525-b5d2-e74860767191', name: 'Service' }); });
const request = (body: unknown) => new Request('http://localhost/api/cv/studio', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
describe('resume studio API boundary', () => {
  it('requires authentication on reads and writes', async () => {
    boundary.user = null;
    expect((await GET()).status).toBe(401);
    expect((await PUT(request({}))).status).toBe(401);
    expect((await DELETE(request({}))).status).toBe(401);
    expect(boundary.save).not.toHaveBeenCalled();
  });
  it('does not let employers mutate seeker resumes', async () => {
    boundary.role = 'employer';
    expect((await PUT(request({ section: 'skills' }))).status).toBe(403);
  });
  it('rejects unknown sections and invalid IDs before a database write', async () => {
    expect((await PUT(request({ section: 'users', id: 'invalid', entry: {} }))).status).toBe(400);
    expect(boundary.save).not.toHaveBeenCalled();
  });
  it('returns a failure rather than an empty successful read', async () => {
    boundary.read.mockRejectedValueOnce(new Error('Unavailable'));
    expect((await GET()).status).toBe(503);
  });
  it('returns the confirmed saved record, without a fallible follow-up read', async () => {
    const response = await PUT(request({ section: 'skills', id: '3a6d9148-2611-4525-b5d2-e74860767191', entry: { name: 'Service' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entry: { name: 'Service' } });
    expect(boundary.read).not.toHaveBeenCalled();
  });
});
