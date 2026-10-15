// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const updatedAt = readFileSync('supabase/migrations/20261014125500_job_listings_updated_at.sql', 'utf8')
const closesAfter = readFileSync('supabase/migrations/20261015180000_job_listings_closes_after.sql', 'utf8')
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE public.job_listings (
    id int PRIMARY KEY, title text, description text, category text, location text, job_type text,
    status text, is_featured boolean DEFAULT false, created_at timestamptz NOT NULL DEFAULT now() - interval '10 days');
    INSERT INTO public.job_listings(id, title, status) VALUES (1, 'Cook', 'active');`)
  await db.exec(updatedAt)
  await db.exec(closesAfter)
  await db.exec(closesAfter) // idempotent
})
afterAll(async () => { await db.close() })

const stamp = async () => (await db.query<{ u: string }>('SELECT updated_at::text AS u FROM public.job_listings WHERE id = 1')).rows[0].u

it('adds a nullable DATE closes_after and bumps updated_at when it changes', async () => {
  const { rows } = await db.query<{ data_type: string; is_nullable: string }>(
    "SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = 'job_listings' AND column_name = 'closes_after'")
  expect(rows).toEqual([{ data_type: 'date', is_nullable: 'YES' }])
  const before = await stamp()
  await db.exec("UPDATE public.job_listings SET is_featured = true WHERE id = 1")
  expect(await stamp()).toBe(before)
  await db.exec("UPDATE public.job_listings SET closes_after = '2026-10-20' WHERE id = 1")
  expect(await stamp()).not.toBe(before)
  const afterDeadline = await stamp()
  await db.exec("UPDATE public.job_listings SET closes_after = '2026-10-20' WHERE id = 1")
  expect(await stamp()).toBe(afterDeadline)
})
