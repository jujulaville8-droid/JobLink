// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
it('allows private incomplete drafts while preserving insert and active edit moderation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;
      CREATE TYPE job_status AS ENUM ('active', 'closed', 'pending_approval');
      CREATE TABLE job_listings (id int PRIMARY KEY, company_id int, title text NOT NULL, description text NOT NULL, category text, location text, status job_status, is_featured boolean DEFAULT false, posted_by_admin boolean DEFAULT false);
      INSERT INTO job_listings VALUES (1, 1, 'Chef', 'Cook', 'Food', 'Town', 'active', false, false), (2, 2, 'Other', 'Other', 'Food', 'Town', 'active', false, false);`);
    const migration = readFileSync('supabase/migrations/20261026190000_employer_drafts_and_benefits.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    await db.exec(`CREATE TRIGGER enforce_listing_moderation BEFORE INSERT OR UPDATE ON job_listings FOR EACH ROW EXECUTE FUNCTION enforce_listing_moderation();
      INSERT INTO job_listings (id, company_id, title, description, status, is_featured) VALUES (3, 1, '', '', 'draft', true), (4, 1, 'Chef', 'Cook', 'active', false);`);
    expect((await db.query('SELECT status, is_featured FROM job_listings WHERE id = 3')).rows).toEqual([{ status: 'draft', is_featured: false }]);
    expect((await db.query('SELECT status FROM job_listings WHERE id = 4')).rows).toEqual([{ status: 'pending_approval' }]);
    await db.exec("UPDATE job_listings SET title = 'Draft chef', benefits = ARRAY['Meals on duty'], draft_data = '{\"step\": 1}' WHERE id = 3");
    expect((await db.query('SELECT status, benefits FROM job_listings WHERE id = 3')).rows).toEqual([{ status: 'draft', benefits: ['Meals on duty'] }]);
    await expect(db.exec("UPDATE job_listings SET status = 'active' WHERE id = 3")).rejects.toThrow(/approval/);
    await db.exec("UPDATE job_listings SET status = 'pending_approval' WHERE id = 3; UPDATE job_listings SET title = 'New chef' WHERE id = 1;");
    expect((await db.query('SELECT status FROM job_listings WHERE id = 1')).rows).toEqual([{ status: 'pending_approval' }]);
    await expect(db.exec("UPDATE job_listings SET status = 'draft' WHERE id = 1")).rejects.toThrow(/approval/);
    await expect(db.exec('UPDATE job_listings SET company_id = 2 WHERE id = 1')).rejects.toThrow(/another company/);
    await expect(db.exec('UPDATE job_listings SET is_featured = true WHERE id = 1')).rejects.toThrow(/Featured/);
    await db.exec("INSERT INTO job_listings (id, company_id, title, description, status) VALUES (5, 1, '', '', 'draft')");
    // Mirror the existing owner/public RLS predicates to prove the new state is not public.
    await db.exec(`CREATE ROLE viewer; GRANT SELECT ON job_listings TO viewer; ALTER TABLE job_listings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY public_jobs ON job_listings FOR SELECT USING (status = 'active');
      CREATE POLICY owner_jobs ON job_listings FOR SELECT USING (company_id::text = current_setting('app.company', true));
      SET ROLE viewer; SET app.company = '99';`);
    expect((await db.query('SELECT id FROM job_listings')).rows).toEqual([{ id: 2 }]);
    await db.exec("SET app.company = '1'");
    expect((await db.query("SELECT id FROM job_listings WHERE status = 'draft'")).rows).toEqual([{ id: 5 }]);
  } finally { await db.close(); }
}, 30_000);
