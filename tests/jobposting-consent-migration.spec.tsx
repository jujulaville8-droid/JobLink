// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('adds consent columns defaulting to no consent, and can be re-run', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE public.job_listings (id integer PRIMARY KEY, title text); INSERT INTO public.job_listings VALUES (1, 'Existing listing');");
    const migration = readFileSync('supabase/migrations/20261106170000_job_listings_structured_data_consent.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    // Listings from before the migration carry no consent.
    expect((await db.query('SELECT structured_data_consent, structured_data_consent_at FROM public.job_listings')).rows)
      .toEqual([{ structured_data_consent: false, structured_data_consent_at: null }]);
    // Recorded consent and its timestamp persist.
    await db.query("UPDATE public.job_listings SET structured_data_consent = true, structured_data_consent_at = '2026-11-06T17:00:00Z' WHERE id = 1");
    expect((await db.query('SELECT structured_data_consent, structured_data_consent_at FROM public.job_listings')).rows)
      .toEqual([{ structured_data_consent: true, structured_data_consent_at: new Date('2026-11-06T17:00:00Z') }]);
    // New rows default to no consent.
    await db.exec("INSERT INTO public.job_listings (id, title) VALUES (2, 'New listing');");
    expect((await db.query('SELECT structured_data_consent FROM public.job_listings WHERE id = 2')).rows)
      .toEqual([{ structured_data_consent: false }]);
  } finally {
    await db.close();
  }
}, 30_000);
