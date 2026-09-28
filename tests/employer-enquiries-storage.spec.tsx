// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE job_listings(id uuid PRIMARY KEY);')
  await db.exec(readFileSync('supabase/migrations/20260929_employer_enquiries.sql', 'utf8'))
}, 20000)
afterAll(async () => { await db.close() })
const insert = `INSERT INTO employer_enquiries(id, company_name, contact_name, email, job_title, details, contact_consent) VALUES('11111111-1111-4111-8111-111111111111','Test cafe','Test owner','owner@example.test','Cook','We need a cook on Saturdays.',true)`
it('stores requests uniquely with private workflow defaults', async () => {
  await db.exec(insert)
  expect((await db.query('SELECT status, notes, notification_sent_at FROM employer_enquiries')).rows).toEqual([{ status: 'new', notes: '', notification_sent_at: null }])
  await expect(db.exec(insert)).rejects.toThrow('duplicate key')
})
it('denies browser reads and writes while allowing the service role', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`)
    try {
      await expect(db.query('SELECT * FROM employer_enquiries')).rejects.toThrow('permission denied')
      await expect(db.exec(insert)).rejects.toThrow('permission denied')
      await expect(db.exec("UPDATE employer_enquiries SET status='live'")).rejects.toThrow('permission denied')
    } finally { await db.exec('RESET ROLE') }
  }
})
it('requires permission and constrains workflow status', async () => {
  await expect(db.exec('UPDATE employer_enquiries SET contact_consent=false')).rejects.toThrow('check constraint')
  await expect(db.exec("UPDATE employer_enquiries SET status='invented'")).rejects.toThrow('check constraint')
})
