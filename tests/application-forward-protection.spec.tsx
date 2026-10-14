// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20261014170000_protect_application_forward_status.sql', 'utf8')
const id = '11111111-1111-4111-8111-111111111111'
let db: PGlite

async function asRole<T>(role: 'anon' | 'authenticated' | 'service_role', action: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE ${role}`)
  try { return await action() } finally { await db.exec('RESET ROLE') }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
  END $$; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`)
})
afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`
    DROP TABLE IF EXISTS public.applications CASCADE;
    CREATE TABLE public.applications (
      id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'applied',
      employer_forward_status text, employer_forward_attempted_at timestamptz, employer_forwarded_at timestamptz);
    GRANT SELECT, INSERT, UPDATE ON public.applications TO anon, authenticated, service_role;
    INSERT INTO public.applications(id) VALUES ('${id}');
  `)
  await db.exec(migration)
  await db.exec(migration) // idempotent
})

const columns = [
  ["employer_forward_status", "'sent'"],
  ['employer_forward_attempted_at', 'now()'],
  ['employer_forwarded_at', 'now()'],
] as const

describe('application forward status protection', () => {
  it.each(columns)('blocks non-service updates to %s', async (column, value) => {
    for (const role of ['authenticated', 'anon'] as const) {
      await expect(asRole(role, () => db.exec(`UPDATE public.applications SET ${column} = ${value}`)))
        .rejects.toThrow('Application forward status is managed by the server')
    }
  })

  it.each(columns)('blocks non-service inserts that set %s', async (column, value) => {
    await expect(asRole('authenticated', () => db.exec(
      `INSERT INTO public.applications(id, ${column}) VALUES (gen_random_uuid(), ${value})`)))
      .rejects.toThrow('Application forward status is managed by the server')
  })

  it('allows other application updates and plain inserts by employers and seekers', async () => {
    await asRole('authenticated', () => db.exec(`UPDATE public.applications SET status = 'shortlisted'`))
    await asRole('authenticated', () => db.exec(`INSERT INTO public.applications(id) VALUES (gen_random_uuid())`))
    expect((await db.query('SELECT count(*)::int AS n FROM public.applications')).rows).toEqual([{ n: 2 }])
  })

  it('lets service_role record the forward result', async () => {
    await asRole('service_role', () => db.exec(
      `UPDATE public.applications SET employer_forward_status = 'sent', employer_forward_attempted_at = now(), employer_forwarded_at = now()`))
    const { rows } = await db.query<{ employer_forward_status: string }>('SELECT employer_forward_status FROM public.applications')
    expect(rows[0].employer_forward_status).toBe('sent')
  })
})
