import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readResume, saveResumeEntry, deleteResumeEntry } from '@/lib/resume-store';

// In-memory database boundary: production store still builds and executes every query.
function database() {
  const rows: Record<string, Record<string, unknown>[]> = {
    cv_profiles: [{ id: 'cv-1', user_id: 'user-1' }],
    seeker_profiles: [{ user_id: 'user-1', first_name: 'Simone', last_name: 'Francis' }],
    cv_skills: [{ id: 'other-skill', cv_profile_id: 'cv-other', name: 'Private skill' }],
  };
  const failures = new Set<string>();
  const client = { from(table: string) {
    const filters: [string, unknown][] = [];
    let operation = 'read'; let payload: Record<string, unknown> = {};
    const query = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      insert: (value: Record<string, unknown>) => { operation = 'insert'; payload = value; return query; },
      update: (value: Record<string, unknown>) => { operation = 'update'; payload = value; return query; },
      delete: () => { operation = 'delete'; return query; },
      maybeSingle: () => execute(true), single: () => execute(true),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute(false)).then(resolve),
    };
    function execute(single: boolean): { data: unknown; error: { code?: string; message: string } | null } {
      if (failures.has(table)) return { data: null, error: { message: 'Database unavailable' } };
      rows[table] ??= [];
      let matching = rows[table].filter(r => filters.every(([key, value]) => r[key] === value));
      if (operation === 'insert') {
        if (rows[table].some(r => r.id === payload.id)) return { data: null, error: { code: '23505', message: 'Duplicate' } };
        rows[table].push({ ...payload }); matching = [rows[table].at(-1)!];
      }
      if (operation === 'update') matching.forEach(r => Object.assign(r, payload));
      if (operation === 'delete') rows[table] = rows[table].filter(r => !matching.includes(r));
      return { data: single ? matching[0] ?? null : matching, error: null };
    }
    return query;
  } } as unknown as SupabaseClient;
  return { client, rows, failures };
}

describe('resume persistence', () => {
  it('rejects failed section reads instead of treating them as an empty resume', async () => {
    const db = database(); db.failures.add('cv_projects');
    await expect(readResume(db.client, 'user-1', 'simone@example.com')).rejects.toThrow();
  });
  it('provides profile contact for a new resume without creating anything on GET', async () => {
    const db = database(); db.rows.cv_profiles = [];
    const result = await readResume(db.client, 'user-1', 'simone@example.com');
    expect(result.contact.first_name).toBe('Simone');
    expect(result.experiences).toEqual([]);
    expect(db.rows.cv_profiles).toEqual([]);
  });
  it('retries a record save without creating a duplicate and leaves other skills untouched', async () => {
    const db = database();
    await saveResumeEntry(db.client, 'user-1', 'skills', 'own-skill', { name: 'Customer service' });
    await saveResumeEntry(db.client, 'user-1', 'skills', 'own-skill', { name: 'Guest relations' });
    expect(db.rows.cv_skills).toEqual([{ id: 'other-skill', cv_profile_id: 'cv-other', name: 'Private skill' }, { id: 'own-skill', cv_profile_id: 'cv-1', name: 'Guest relations', sort_order: 0 }]);
  });
  it('never overwrites another owner’s record, even without database RLS', async () => {
    const db = database();
    await expect(saveResumeEntry(db.client, 'user-1', 'skills', 'other-skill', { name: 'Overwrite' })).rejects.toThrow();
    expect(db.rows.cv_skills[0].name).toBe('Private skill');
  });
  it('never deletes another owner’s record', async () => {
    const db = database();
    await deleteResumeEntry(db.client, 'user-1', 'skills', 'other-skill');
    expect(db.rows.cv_skills[0].name).toBe('Private skill');
  });
  it('does not erase a saved skill when a new save fails', async () => {
    const db = database(); db.failures.add('cv_skills');
    await expect(saveResumeEntry(db.client, 'user-1', 'skills', 'own-skill', { name: 'New skill' })).rejects.toThrow();
    expect(db.rows.cv_skills).toHaveLength(1);
  });
});
