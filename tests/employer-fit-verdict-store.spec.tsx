// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadFitVerdicts, saveFitVerdict, saveNotScreened } from '../src/lib/employer-screening/fit-verdict-store'
import { NOT_SCREENED_TEXT } from '../src/lib/employer-screening/not-screened'
import { UNAVAILABLE_FIT, simpleFitEmailText } from '../src/lib/employer-screening/simple-fit'
import { loadProfileResume } from '../src/lib/employer-screening/profile-resume'

describe('fit verdict persistence', () => {
  it.each(Object.keys(NOT_SCREENED_TEXT) as (keyof typeof NOT_SCREENED_TEXT)[])('inserts %s without overwriting an existing outcome', async reason => {
    const upsert = vi.fn(async () => ({ error: null }))
    await saveNotScreened({ from: () => ({ upsert }) } as unknown as SupabaseClient, 'app', reason)
    expect(upsert).toHaveBeenCalledWith({ application_id: 'app', verdict: 'not_screened', verdict_text: NOT_SCREENED_TEXT[reason] }, { onConflict: 'application_id', ignoreDuplicates: true })
  })
  it('stores exactly the employer email line without resume source material', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const db = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient
    await saveFitVerdict(db, 'application', UNAVAILABLE_FIT)
    expect(db.from).toHaveBeenCalledWith('application_fit_verdicts')
    expect(upsert).toHaveBeenCalledWith({ application_id: 'application', verdict: 'unavailable', verdict_text: simpleFitEmailText(UNAVAILABLE_FIT) }, { onConflict: 'application_id' })
  })
  it('tolerates an absent table and reads persisted lines when present', async () => {
    const query = vi.fn().mockResolvedValueOnce({ error: { code: '42P01' } }).mockResolvedValueOnce({ data: [{ application_id: 'app', verdict: 'unavailable', verdict_text: 'Fit check unavailable.' }], error: null })
    const db = { from: () => ({ select: () => ({ in: query }) }) } as unknown as SupabaseClient
    expect(await loadFitVerdicts(db, ['app'])).toEqual(new Map())
    expect(await loadFitVerdicts(db, ['app'])).toEqual(new Map([['app', { verdict: 'unavailable', text: 'Fit check unavailable.' }]]))
  })
  it.each(['good_fit', 'not_a_fit', 'not_enough_information', 'not_screened'])('loads %s with its unchanged display text', async verdict => {
    const select = vi.fn(() => ({ in: async () => ({ data: [{ application_id: 'app', verdict, verdict_text: 'Recorded text' }], error: null }) }))
    const db = { from: () => ({ select }) } as unknown as SupabaseClient
    expect(await loadFitVerdicts(db, ['app'])).toEqual(new Map([['app', { verdict, text: 'Recorded text' }]]))
    expect(select).toHaveBeenCalledWith('application_id, verdict, verdict_text')
  })
  it('restricts SQL reads to the owner and admin, and writes to service role', async () => {
    const db = new PGlite()
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
        create function public.is_admin_user() returns boolean language sql stable as $$ select current_setting('test.admin', true) = 'true' $$;
        create table public.companies(id uuid primary key, user_id uuid);
        create table public.job_listings(id uuid primary key, company_id uuid);
        create table public.applications(id uuid primary key, job_id uuid);
        grant usage on schema auth to authenticated;
        grant select on companies, job_listings, applications to authenticated;
        insert into companies values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
        insert into job_listings values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001');
        insert into applications values ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003');`)
      await db.exec(readFileSync('supabase/migrations/20261114020000_application_fit_verdicts.sql', 'utf8'))
      await db.exec(readFileSync('supabase/migrations/20261116010000_application_not_screened.sql', 'utf8'))
      await db.exec(`insert into application_fit_verdicts(application_id,verdict,verdict_text) values ('00000000-0000-4000-8000-000000000004','not_screened','Not screened: screening could not be completed for this application.'); delete from application_fit_verdicts;`)
      await db.exec(`set role service_role; insert into application_fit_verdicts(application_id,verdict,verdict_text) values ('00000000-0000-4000-8000-000000000004','unavailable','Fit check unavailable.'); reset role;
        set role authenticated; set test.uid = '00000000-0000-4000-8000-000000000005'; set test.admin = 'false';`)
      expect((await db.query('select * from application_fit_verdicts')).rows).toHaveLength(0)
      await db.exec(`set test.uid = '00000000-0000-4000-8000-000000000002'`)
      expect((await db.query('select * from application_fit_verdicts')).rows).toHaveLength(1)
      await expect(db.exec("update application_fit_verdicts set verdict_text = 'changed'")).rejects.toThrow('permission denied')
      await db.exec(`set test.uid = '00000000-0000-4000-8000-000000000005'; set test.admin = 'true'`)
      expect((await db.query('select * from application_fit_verdicts')).rows).toHaveLength(1)
      await db.exec('reset role; set role anon')
      await expect(db.query('select * from application_fit_verdicts')).rejects.toThrow('permission denied')
    } finally { await db.close() }
  }, 15000)
})
describe('service profile resume loading', () => {
  it('binds profile lookup and storage path to the applicant and rejects foreign files', async () => {
    const user = '00000000-0000-4000-8000-000000000002'
    const download = vi.fn(async () => ({ data: new Blob(['%PDF-test']), error: null }))
    const eq = vi.fn()
    let path = `${user}/cv-123.pdf`
    const query = { select: () => query, eq: (...args: unknown[]) => { eq(...args); return query }, abortSignal: () => query, maybeSingle: async () => ({ data: { cv_url: path }, error: null }) }
    const db = { from: () => query, storage: { from: () => ({ download }) } } as unknown as SupabaseClient
    expect(await loadProfileResume(db, user, new AbortController().signal)).toEqual(new Uint8Array(Buffer.from('%PDF-test')))
    expect(eq).toHaveBeenCalledWith('user_id', user)
    expect(download).toHaveBeenCalledWith(path)
    path = 'another-user/cv-123.pdf'
    expect(await loadProfileResume(db, user, new AbortController().signal)).toBeNull()
    expect(download).toHaveBeenCalledOnce()
  })
})
