// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20261005152749_company_contact_email.sql', 'utf8')
const privilegedFieldsSql = readFileSync('supabase/migrations/20260925_security_hardening_2.sql', 'utf8')
  .match(/CREATE OR REPLACE FUNCTION public\.protect_company_privileged_fields\(\)[\s\S]*?EXECUTE FUNCTION public\.protect_company_privileged_fields\(\);/)![0]
const companyId = '11111111-1111-4111-8111-111111111111'
const otherCompanyId = '22222222-2222-4222-8222-222222222222'
let db: PGlite

async function asRole<T>(role: 'anon' | 'authenticated' | 'service_role', action: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE ${role}`)
  try { return await action() } finally { await db.exec('RESET ROLE') }
}

async function createCompanies(existingContactColumn = false) {
  await db.exec(`
    DROP TABLE IF EXISTS public.companies CASCADE;
    CREATE TABLE public.companies (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      company_name text NOT NULL,
      logo_url text,
      description text,
      is_pro boolean NOT NULL DEFAULT false,
      is_verified boolean NOT NULL DEFAULT false,
      pro_expires_at timestamptz,
      stripe_customer_id text
      ${existingContactColumn ? ', contact_email text' : ''}
    );
    GRANT SELECT, INSERT, UPDATE ON public.companies TO anon, authenticated, service_role;
    INSERT INTO public.companies(id, user_id, company_name, description)
      VALUES ('${companyId}', '${companyId}', 'Existing company', 'Original description');
  `)
  // Keep the real existing billing/verification trigger active alongside this migration.
  await db.exec(privilegedFieldsSql)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
      AS $$ SELECT current_user::text $$;
  `)
}, 20000)
beforeEach(async () => {
  await createCompanies()
  await db.exec(migration)
})
afterAll(async () => { await db.close() })

describe('company notification contact migration', () => {
  it('adds a nullable text column without a default or backfill when missing', async () => {
    const column = await db.query(`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'contact_email'
    `)
    expect(column.rows).toEqual([{ data_type: 'text', is_nullable: 'YES', column_default: null }])
    expect((await db.query('SELECT contact_email FROM public.companies')).rows).toEqual([{ contact_email: null }])
  })

  it('preserves an existing column and its legacy values exactly', async () => {
    await createCompanies(true)
    await db.exec(`
      UPDATE public.companies SET contact_email = ' Legacy invalid address ' WHERE id = '${companyId}';
      INSERT INTO public.companies(id, user_id, company_name, contact_email)
        VALUES ('${otherCompanyId}', '${otherCompanyId}', 'Other company', 'OWNER@EXAMPLE.TEST');
    `)
    await db.exec(migration)
    expect((await db.query('SELECT contact_email FROM public.companies ORDER BY id')).rows).toEqual([
      { contact_email: ' Legacy invalid address ' }, { contact_email: 'OWNER@EXAMPLE.TEST' },
    ])
  })

  it('is idempotent and preserves a contact set by the server', async () => {
    await asRole('service_role', () => db.exec(`UPDATE public.companies SET contact_email = 'owner@example.test' WHERE id = '${companyId}'`))
    await db.exec(migration)
    await db.exec(migration)
    expect((await db.query('SELECT contact_email FROM public.companies')).rows).toEqual([{ contact_email: 'owner@example.test' }])
    const triggers = await db.query(`
      SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.companies'::regclass
        AND tgname = 'protect_company_contact_email' AND NOT tgisinternal
    `)
    expect(triggers.rows).toEqual([{ tgname: 'protect_company_contact_email' }])
  })

  it('allows self-serve inserts that omit or explicitly clear the notification contact', async () => {
    await asRole('authenticated', async () => {
      await db.exec(`INSERT INTO public.companies(id, user_id, company_name) VALUES ('${otherCompanyId}', '${otherCompanyId}', 'Self serve')`)
      await db.exec(`INSERT INTO public.companies(id, user_id, company_name, contact_email) VALUES ('33333333-3333-4333-8333-333333333333', '${otherCompanyId}', 'Null contact', NULL)`)
    })
    expect((await db.query('SELECT contact_email FROM public.companies ORDER BY id')).rows).toEqual([
      { contact_email: null }, { contact_email: null }, { contact_email: null },
    ])
  })

  it.each(['anon', 'authenticated'] as const)('rejects direct %s inserts with any nonnull contact', async role => {
    await asRole(role, async () => {
      for (const contact of ['owner@example.test', '']) {
        await expect(db.query('INSERT INTO public.companies(id, user_id, company_name, contact_email) VALUES ($1, $1, $2, $3)', [otherCompanyId, 'Injected contact', contact]))
          .rejects.toMatchObject({ code: '42501', message: 'Company notification contact is managed by the server' })
      }
    })
    expect((await db.query('SELECT id FROM public.companies')).rows).toEqual([{ id: companyId }])
  })

  it.each(['anon', 'authenticated'] as const)('rejects direct %s set, replacement, and clear', async role => {
    await asRole(role, () => expect(db.exec(`UPDATE public.companies SET contact_email = 'attacker@example.test' WHERE id = '${companyId}'`))
      .rejects.toMatchObject({ code: '42501' }))
    await asRole('service_role', () => db.exec(`UPDATE public.companies SET contact_email = 'owner@example.test' WHERE id = '${companyId}'`))
    await asRole(role, async () => {
      await expect(db.exec(`UPDATE public.companies SET contact_email = 'attacker@example.test' WHERE id = '${companyId}'`)).rejects.toMatchObject({ code: '42501' })
      await expect(db.exec(`UPDATE public.companies SET contact_email = NULL WHERE id = '${companyId}'`)).rejects.toMatchObject({ code: '42501' })
    })
    expect((await db.query('SELECT contact_email FROM public.companies')).rows).toEqual([{ contact_email: 'owner@example.test' }])
  })

  it('allows ordinary profile and logo edits with unchanged contact, including the same explicit contact value', async () => {
    await asRole('service_role', () => db.exec(`UPDATE public.companies SET contact_email = 'owner@example.test' WHERE id = '${companyId}'`))
    await asRole('authenticated', () => db.exec(`
      UPDATE public.companies SET company_name = 'Updated name', description = 'Updated description',
        logo_url = 'https://example.test/logo.png', contact_email = 'owner@example.test'
      WHERE id = '${companyId}'
    `))
    expect((await db.query('SELECT company_name, description, logo_url, contact_email FROM public.companies')).rows).toEqual([{
      company_name: 'Updated name', description: 'Updated description',
      logo_url: 'https://example.test/logo.png', contact_email: 'owner@example.test',
    }])
  })

  it('retains malformed legacy contact while allowing unrelated self-serve profile edits', async () => {
    await createCompanies(true)
    await db.exec(`UPDATE public.companies SET contact_email = ' Legacy invalid address ' WHERE id = '${companyId}'`)
    await db.exec(migration)
    await asRole('authenticated', () => db.exec(`UPDATE public.companies SET description = 'Updated profile' WHERE id = '${companyId}'`))
    expect((await db.query('SELECT description, contact_email FROM public.companies')).rows).toEqual([{
      description: 'Updated profile', contact_email: ' Legacy invalid address ',
    }])
  })

  it('allows service-role creation, setting, replacement, and clearing', async () => {
    await asRole('service_role', async () => {
      await db.exec(`INSERT INTO public.companies(id, user_id, company_name, contact_email) VALUES ('${otherCompanyId}', '${otherCompanyId}', 'Admin company', 'new@example.test')`)
      await db.exec(`UPDATE public.companies SET contact_email = 'owner@example.test' WHERE id = '${companyId}'`)
      await db.exec(`UPDATE public.companies SET contact_email = 'replacement@example.test' WHERE id = '${companyId}'`)
    })
    expect((await db.query('SELECT contact_email FROM public.companies ORDER BY id')).rows).toEqual([
      { contact_email: 'replacement@example.test' }, { contact_email: 'new@example.test' },
    ])
    await asRole('service_role', () => db.exec(`UPDATE public.companies SET contact_email = NULL WHERE id = '${companyId}'`))
    expect((await db.query(`SELECT contact_email FROM public.companies WHERE id = '${companyId}'`)).rows).toEqual([{ contact_email: null }])
  })

  it('checks the actual database role rather than a client-supplied request claim', async () => {
    await asRole('authenticated', async () => {
      await db.exec(`SET request.jwt.claims = '{"role":"service_role","is_admin":true}'`)
      await expect(db.exec(`UPDATE public.companies SET contact_email = 'attacker@example.test' WHERE id = '${companyId}'`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('uses an invoker function and retains the existing billing/verification protection', async () => {
    const functions = await db.query(`
      SELECT prosecdef FROM pg_proc
      WHERE oid = 'public.protect_company_contact_email()'::regprocedure
    `)
    expect(functions.rows).toEqual([{ prosecdef: false }])
    await asRole('authenticated', () => expect(db.exec(`UPDATE public.companies SET is_pro = true WHERE id = '${companyId}'`))
      .rejects.toThrow('Billing and verification fields are managed by the server'))
  })
})
