// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), sign: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireUser: mocks.auth }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from, storage: { from: () => ({ createSignedUrl: mocks.sign }) } }) }));
import { GET } from '@/app/api/cv-download-attachment/route';
let owner: unknown, name: unknown, role: unknown, message: unknown;
beforeEach(() => {
  vi.clearAllMocks(); owner = { id: 'profile' }; name = { first_name: 'Jane', last_name: 'Smith' }; role = { role: 'employer', is_admin: false }; message = { id: 'message' };
  mocks.auth.mockResolvedValue({ user: { id: 'caller' } });
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.example/file' }, error: null });
  mocks.from.mockImplementation((table: string) => {
    let fields = '';
    const q = { select: (s: string) => { fields = s; return q; }, eq: () => q, limit: () => q,
      single: async () => ({ data: role }), maybeSingle: async () => ({ data: table === 'seeker_profiles' ? (fields === 'first_name, last_name' ? name : owner) : table === 'messages' ? message : null }) };
    return q;
  });
});
const request = (path = 'owner/cv-123.pdf') => GET(new NextRequest(`https://app.example/api/cv-download-attachment?path=${encodeURIComponent(path)}`));
it('names owner downloads while preserving the stored path', async () => { expect((await request()).status).toBe(307); expect(mocks.sign).toHaveBeenCalledWith('owner/cv-123.pdf', 3600, { download: 'Jane Smith Resume.pdf' }); });
it('names authorized received documents with Unicode and DOCX extension', async () => { owner = null; name = { first_name: '李', last_name: '小龍' }; expect((await request('owner/cv-123.docx')).status).toBe(307); expect(mocks.sign).toHaveBeenCalledWith('owner/cv-123.docx', 3600, { download: '李 小龍 Resume.docx' }); });
it('uses a neutral name for historical attachments without a matching profile', async () => { owner = null; name = null; expect((await request()).status).toBe(307); expect(mocks.sign).toHaveBeenCalledWith('owner/cv-123.pdf', 3600, { download: 'Resume.pdf' }); });
it('still rejects an unrelated employer before naming or signing', async () => { owner = null; message = null; expect((await request()).status).toBe(403); expect(mocks.sign).not.toHaveBeenCalled(); });
it('still rejects unauthenticated requests', async () => { mocks.auth.mockResolvedValue({ error: Response.json({}, { status: 401 }) }); expect((await request()).status).toBe(401); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.sign).not.toHaveBeenCalled(); });
