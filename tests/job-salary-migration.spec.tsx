// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('preserves unknown legacy pay periods and validates new periods after repeat migration', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE public.job_listings (id integer PRIMARY KEY, salary_min integer); INSERT INTO public.job_listings VALUES (1, 25);');
    const migration = readFileSync('supabase/migrations/20261025120000_job_listings_salary_type.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    expect((await db.query('SELECT * FROM public.job_listings')).rows).toEqual([{ id: 1, salary_min: 25, salary_type: null }]);
    for (const period of ['hourly', 'weekly', 'biweekly', 'monthly', 'annually']) {
      await db.query('UPDATE public.job_listings SET salary_type = $1 WHERE id = 1', [period]);
      expect((await db.query('SELECT salary_type FROM public.job_listings')).rows).toEqual([{ salary_type: period }]);
    }
    await expect(db.query('UPDATE public.job_listings SET salary_type = $1', ['daily'])).rejects.toThrow(/job_listings_salary_type_check/);
  } finally {
    await db.close();
  }
}, 30_000);
