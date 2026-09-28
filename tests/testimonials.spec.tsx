// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { caseSnippet, escapeHtml, insertProof } from '../src/lib/testimonial-content'

const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const application = '33333333-3333-4333-8333-333333333333'
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${owner}'::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE companies(id uuid PRIMARY KEY, user_id uuid, company_name text);
    CREATE TABLE job_listings(id uuid PRIMARY KEY, company_id uuid, title text, status text);
    CREATE TABLE applications(id uuid PRIMARY KEY, job_id uuid);
    INSERT INTO users VALUES('${owner}'),('${other}');
    INSERT INTO companies VALUES('${owner}','${owner}','Island Employer');
    INSERT INTO job_listings VALUES('${owner}','${owner}','Cook','active');
    INSERT INTO applications VALUES('${application}','${owner}');`)
  await db.exec(readFileSync('supabase/migrations/20260928_placement_testimonials.sql', 'utf8'))
}, 20000)
afterAll(async () => { await db.close() })

describe('placement storage and privacy', () => {
  it('rejects another employer and leaves the listing open', async () => {
    await expect(db.query('SELECT confirm_placement($1,$2,true)', [application, other])).rejects.toThrow('not owned')
    expect((await db.query('SELECT status FROM job_listings')).rows).toEqual([{ status: 'active' }])
  })
  it('confirms once across retries and closes the job atomically', async () => {
    const a = await db.query('SELECT confirm_placement($1,$2,true)', [application, owner])
    const b = await db.query('SELECT confirm_placement($1,$2,false)', [application, owner])
    expect(a.rows).toEqual(b.rows)
    expect((await db.query('SELECT count(*)::int AS n FROM placements')).rows).toEqual([{ n: 1 }])
    expect((await db.query('SELECT status FROM job_listings')).rows).toEqual([{ status: 'closed' }])
  })
  it('does not let browser roles manufacture or approve a placement', async () => {
    await db.exec('SET ROLE authenticated')
    try {
      await expect(db.query('SELECT confirm_placement($1,$2,false)', [application, owner])).rejects.toThrow('permission denied')
      await expect(db.exec("UPDATE placements SET review_status='approved'")).rejects.toThrow('permission denied')
      expect((await db.query('SELECT id FROM placements')).rows).toHaveLength(1)
    } finally { await db.exec('RESET ROLE') }
    await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${other}'::uuid $$; SET ROLE authenticated;`)
    try { expect((await db.query('SELECT id FROM placements')).rows).toHaveLength(0) } finally { await db.exec('RESET ROLE') }
    await db.exec('SET ROLE anon')
    try { await expect(db.query('SELECT * FROM placements')).rejects.toThrow('permission denied') } finally { await db.exec('RESET ROLE') }
  })
  it('requires consent and a strong rating before approval', async () => {
    await db.exec("UPDATE placements SET feedback='We found an excellent cook.', rating=5")
    await expect(db.exec("UPDATE placements SET review_status='approved'")).rejects.toThrow('check constraint')
    await db.exec('UPDATE placements SET consent=true, rating=3')
    await expect(db.exec("UPDATE placements SET review_status='approved'")).rejects.toThrow('check constraint')
    await db.exec("UPDATE placements SET rating=5, review_status='approved'")
    await db.exec("UPDATE placements SET consent=false, review_status='pending'")
    expect((await db.query("SELECT id FROM placements WHERE review_status='approved' AND consent")).rows).toHaveLength(0)
  })
})

describe('honest, safe snippets', () => {
  it('retains short quotes exactly and only truncates long ones', () => {
    expect(caseSnippet('A helpful hiring service.')).toBe('A helpful hiring service.')
    const quote = 'We found a great cook through JobLinks. '.repeat(15)
    const snippet = caseSnippet(quote)
    expect(snippet.length).toBeLessThanOrEqual(281)
    expect(quote.startsWith(snippet.slice(0, -1))).toBe(true)
  })
  it('escapes untrusted company and testimonial content', () => {
    expect(escapeHtml('<script>"&\'</script>')).toBe('&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;')
  })
  it('inserts proof inside full emails and supports fragments and empty pools', () => {
    expect(insertProof('<html><body>Hello</body></html>', '<p>Proof</p>')).toBe('<html><body>Hello<p>Proof</p></body></html>')
    expect(insertProof('<p>Hello</p>', 'Proof')).toBe('<p>Hello</p>Proof')
    expect(insertProof('Unchanged', '')).toBe('Unchanged')
  })
})
