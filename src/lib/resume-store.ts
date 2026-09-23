import type { SupabaseClient } from '@supabase/supabase-js';
import type { CvFull } from '@/lib/types';
import { resumeSectionDefinitions, validateResumeEntry, type EditorSection, type RecordSection, type EntryDraft } from '@/lib/resume-sections';

export async function readResume(client: SupabaseClient, userId: string, email: string): Promise<CvFull> {
  const [profile, seeker] = await Promise.all([
    client.from('cv_profiles').select('*').eq('user_id', userId).maybeSingle(),
    client.from('seeker_profiles').select('first_name,last_name,phone,location').eq('user_id', userId).maybeSingle(),
  ]);
  if (profile.error || seeker.error) throw new Error('Could not load your resume. Please try again.');
  const sections = await Promise.all(resumeSectionDefinitions.map(async s => {
    if (!profile.data) return [s.key, []] as const;
    const result = await client.from(s.table).select('*').eq('cv_profile_id', profile.data.id).order('sort_order');
    if (result.error) throw new Error(`Could not load ${s.title.toLowerCase()}. Please try again.`);
    return [s.key, result.data ?? []] as const;
  }));
  return {
    ...Object.fromEntries(sections),
    profile: profile.data ?? { id: '', user_id: userId, job_title: null, summary: null, completion_percentage: 0, created_at: '', updated_at: '' },
    contact: { first_name: seeker.data?.first_name ?? null, last_name: seeker.data?.last_name ?? null, phone: seeker.data?.phone ?? null, location: seeker.data?.location ?? null, email },
  } as CvFull;
}

async function ownProfile(client: SupabaseClient, userId: string, create: boolean): Promise<string | null> {
  const existing = await client.from('cv_profiles').select('id').eq('user_id', userId).maybeSingle();
  if (existing.error) throw new Error('Could not load your resume. Please try again.');
  if (existing.data) return existing.data.id;
  if (!create) return null;
  const inserted = await client.from('cv_profiles').insert({ user_id: userId }).select('id').single();
  if (inserted.error?.code === '23505') return ownProfile(client, userId, false);
  if (inserted.error || !inserted.data) throw new Error('Could not create your resume. Please try again.');
  return inserted.data.id;
}

export async function saveResumeEntry(client: SupabaseClient, userId: string, section: EditorSection, id: string, entry: EntryDraft, sortOrder = 0) {
  const values = validateResumeEntry(section, entry);
  const profileId = await ownProfile(client, userId, true);
  if (!profileId) throw new Error('Could not create your resume. Please try again.');
  if (section === 'profile') {
    const result = await client.from('cv_profiles').update(values).eq('id', profileId).eq('user_id', userId).select('*').single();
    if (result.error || !result.data) throw new Error('Your changes could not be saved. Please try again.');
    return result.data;
  }
  const definition = resumeSectionDefinitions.find(s => s.key === section)!;
  const existing = await client.from(definition.table).select('id').eq('id', id).eq('cv_profile_id', profileId).maybeSingle();
  if (existing.error) throw new Error('Could not check this entry. Please try again.');
  // Stable client UUIDs make a retry safe after a response is lost. All updates
  // include the owner profile filter, even if a table's RLS is misconfigured.
  const result = existing.data
    ? await client.from(definition.table).update({ ...values, sort_order: sortOrder }).eq('id', id).eq('cv_profile_id', profileId).select('*').single()
    : await client.from(definition.table).insert({ ...values, id, cv_profile_id: profileId, sort_order: sortOrder }).select('*').single();
  if (result.error || !result.data) throw new Error('Your changes could not be saved. Please try again. Your draft is still here.');
  return result.data;
}
export async function deleteResumeEntry(client: SupabaseClient, userId: string, section: RecordSection, id: string) {
  const definition = resumeSectionDefinitions.find(s => s.key === section);
  if (!definition) throw new Error('Choose a valid resume section.');
  const profileId = await ownProfile(client, userId, false);
  if (!profileId) return;
  // Idempotent: an already removed entry is a successful deletion, never an
  // invitation to broaden the owner filter.
  const result = await client.from(definition.table).delete().eq('id', id).eq('cv_profile_id', profileId);
  if (result.error) throw new Error('Could not remove this entry. Please try again.');
}
