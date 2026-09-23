import { createClient } from '@/lib/supabase/server';
import { readResume, saveResumeEntry, deleteResumeEntry } from '@/lib/resume-store';
import { resumeSectionDefinitions, validateResumeEntry, type EditorSection, type EntryDraft, type RecordSection } from '@/lib/resume-sections';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function authorize() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { response: json({ error: 'Sign in to continue.' }, 401) };
  const account = await client.from('users').select('role,email_verified').eq('id', user.id).single();
  if (account.error) return { response: json({ error: 'Could not verify your account. Please try again.' }, 503) };
  if (!user.email_confirmed_at || !account.data?.email_verified || account.data.role !== 'seeker') return { response: json({ error: 'A verified job-seeker account is required.' }, 403) };
  return { client, user };
}

export async function GET() {
  try {
    const auth = await authorize();
    if (auth.response) return auth.response;
    return json(await readResume(auth.client!, auth.user!.id, auth.user!.email ?? ''));
  } catch {
    return json({ error: 'Could not load your resume. Please try again.' }, 503);
  }
}

async function mutate(request: Request, remove: boolean) {
  try {
    const auth = await authorize();
    if (auth.response) return auth.response;
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, 400);
    const section = body.section as EditorSection;
    const allowed = section === 'profile' || resumeSectionDefinitions.some(s => s.key === section);
    if (!allowed || (remove && section === 'profile') || (section !== 'profile' && (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)))) return json({ error: 'Choose a valid resume entry.' }, 400);
    if (remove) {
      await deleteResumeEntry(auth.client!, auth.user!.id, section as RecordSection, body.id);
      return json({ success: true });
    }
    let entry: EntryDraft;
    try {
      if (!body.entry || typeof body.entry !== 'object' || Array.isArray(body.entry)) throw new Error('Provide a resume entry.');
      entry = validateResumeEntry(section, body.entry);
    } catch (error) { return json({ error: error instanceof Error ? error.message : 'Check your entry.' }, 400); }
    const sortOrder = Number.isSafeInteger(body.sort_order) && body.sort_order >= 0 ? Math.min(body.sort_order, 10000) : 0;
    const saved = await saveResumeEntry(auth.client!, auth.user!.id, section, body.id, entry, sortOrder);
    return json({ success: true, entry: saved });
  } catch {
    return json({ error: 'Your changes could not be saved. Please try again. Your draft is still here.' }, 503);
  }
}

export const PUT = (request: Request) => mutate(request, false);
export const DELETE = (request: Request) => mutate(request, true);
