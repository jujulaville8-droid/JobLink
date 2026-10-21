import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const draft = readFileSync(new URL('../docs/employer-screening/drafts/employer-capture-storage.unapplied.sql', import.meta.url), 'utf8');
const bucket = 'employer-screening-captures';
const otherBucket = 'synthetic-unrelated-bucket';
const metadata = {
  id: bucket,
  name: bucket,
  public: false,
  file_size_limit: 5 * 1024 * 1024,
  allowed_mime_types: ['application/pdf'],
};
let db;

before(async () => {
  // Entirely in-memory, synthetic PostgreSQL semantics. No Supabase client,
  // environment variables, network, service creation, or real applicant data.
  db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`
    RESET ROLE;
    DROP SCHEMA IF EXISTS storage CASCADE;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY, name text UNIQUE, public boolean,
      file_size_limit bigint, allowed_mime_types text[],
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}', UNIQUE(bucket_id, name)
    );
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
    GRANT SELECT ON storage.buckets TO service_role;
    -- Deliberately overbroad existing policies and grants: the new restrictive
    -- policy must still prevent every browser operation on the capture bucket.
    CREATE POLICY synthetic_broad_browser_access ON storage.objects AS PERMISSIVE
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  `);
  await insertBucket({ id: otherBucket, name: otherBucket, public: true, file_size_limit: 10000000, allowed_mime_types: ['image/png'] });
});

async function insertBucket(value = metadata) {
  await db.query(`INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ($1, $2, $3, $4, $5)`, [value.id, value.name, value.public, value.file_size_limit, value.allowed_mime_types]);
}

async function getBucket(id = bucket) {
  return (await db.query('SELECT * FROM storage.buckets WHERE id = $1', [id])).rows[0];
}

async function asRole(role, run) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await db.exec(`SET ROLE ${role}`);
  try { return await run(); }
  finally { await db.exec('RESET ROLE'); }
}

async function expectDraftAbort(pattern) {
  try { await assert.rejects(db.exec(draft), pattern); }
  finally { await db.exec('ROLLBACK'); }
}

async function seedObjects() {
  await db.exec(draft);
  await db.query('INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2), ($3, $4)',
    [bucket, 'synthetic-capture.pdf', otherBucket, 'synthetic-other.png']);
}

test('unapplied draft creates an exact private 5 MiB PDF-only bucket and scoped restrictive policy', async () => {
  const unrelated = await getBucket(otherBucket);
  await db.exec(draft);
  const created = await getBucket();
  assert.deepEqual({ ...created, created_at: undefined }, { ...metadata, created_at: undefined });
  assert.deepEqual(await getBucket(otherBucket), unrelated);
  const { rows: [policy] } = await db.query(`SELECT permissive, cmd, roles, qual, with_check
    FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'employer_screening_no_browser_captures'`);
  assert.equal(policy.permissive, 'RESTRICTIVE');
  assert.equal(policy.cmd, 'ALL');
  assert.deepEqual([...policy.roles].sort(), ['anon', 'authenticated']);
  assert.match(policy.qual, /bucket_id <> 'employer-screening-captures'/);
  assert.equal(policy.with_check, policy.qual);
});

test('an existing compatible bucket is accepted without changing its metadata or identity', async () => {
  await insertBucket();
  await db.exec("UPDATE storage.buckets SET created_at = '2020-01-01T00:00:00Z' WHERE id = 'employer-screening-captures'");
  const existing = await getBucket();
  await db.exec(draft);
  assert.deepEqual(await getBucket(), existing);
});

test('conflicting or unknown bucket metadata aborts atomically without repairing the bucket', async t => {
  for (const [label, patch] of [
    ['public', { public: true }],
    ['unknown privacy', { public: null }],
    ['different name', { name: 'synthetic-conflicting-name' }],
    ['unknown name', { name: null }],
    ['oversize limit', { file_size_limit: 5242881 }],
    ['different smaller limit', { file_size_limit: 1048576 }],
    ['unlimited size', { file_size_limit: null }],
    ['nonpositive size', { file_size_limit: 0 }],
    ['any MIME type', { allowed_mime_types: null }],
    ['empty MIME types', { allowed_mime_types: [] }],
    ['mixed MIME types', { allowed_mime_types: ['application/pdf', 'text/plain'] }],
    ['wildcard MIME type', { allowed_mime_types: ['application/*'] }],
    ['unknown MIME member', { allowed_mime_types: ['application/pdf', null] }],
  ]) {
    await t.test(label, async () => {
      await insertBucket({ ...metadata, ...patch });
      const existing = await getBucket();
      const unrelated = await getBucket(otherBucket);
      await expectDraftAbort(/EMPLOYER_CAPTURE_BUCKET_METADATA_CONFLICT/);
      assert.deepEqual(await getBucket(), existing);
      assert.deepEqual(await getBucket(otherBucket), unrelated);
      assert.equal((await db.query(`SELECT 1 FROM pg_policies
        WHERE policyname = 'employer_screening_no_browser_captures'`)).rows.length, 0);
      await db.query('DELETE FROM storage.buckets WHERE id = $1', [bucket]);
    });
  }
});

test('disabled object RLS fails closed without creating a bucket or altering unrelated RLS behavior', async () => {
  await db.exec('ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY');
  const unrelated = await getBucket(otherBucket);
  await expectDraftAbort(/EMPLOYER_CAPTURE_STORAGE_RLS_REQUIRED/);
  assert.equal(await getBucket(), undefined);
  assert.deepEqual(await getBucket(otherBucket), unrelated);
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass")).rows[0].relrowsecurity, false);
});

for (const role of ['anon', 'authenticated']) {
  test(`${role} cannot read, upload, overwrite, move, or delete captures despite broad grants`, async () => {
    await seedObjects();
    const original = (await db.query('SELECT * FROM storage.objects WHERE bucket_id = $1', [bucket])).rows;
    await asRole(role, async () => {
      assert.equal((await db.query('SELECT * FROM storage.objects WHERE bucket_id = $1', [bucket])).rows.length, 0);
      assert.deepEqual((await db.query('SELECT DISTINCT bucket_id FROM storage.objects')).rows, [{ bucket_id: otherBucket }]);
      await assert.rejects(db.query('INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2)',
        [bucket, 'synthetic-new.pdf']), /row-level security/);
      await assert.rejects(db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2)
        ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = '{"overwritten":true}'`,
      [bucket, 'synthetic-capture.pdf']), /row-level security/);
      assert.equal((await db.query(`UPDATE storage.objects SET metadata = '{"overwritten":true}'
        WHERE bucket_id = $1 RETURNING id`, [bucket])).rows.length, 0);
      assert.equal((await db.query('UPDATE storage.objects SET bucket_id = $1 WHERE bucket_id = $2 RETURNING id',
        [otherBucket, bucket])).rows.length, 0);
      await assert.rejects(db.query('UPDATE storage.objects SET bucket_id = $1 WHERE bucket_id = $2',
        [bucket, otherBucket]), /row-level security/);
      assert.equal((await db.query('DELETE FROM storage.objects WHERE bucket_id = $1 RETURNING id', [bucket])).rows.length, 0);
    });
    assert.deepEqual((await db.query('SELECT * FROM storage.objects WHERE bucket_id = $1', [bucket])).rows, original);
  });

  test(`${role} retains existing permitted operations in unrelated buckets`, async () => {
    await seedObjects();
    await asRole(role, async () => {
      assert.equal((await db.query('SELECT * FROM storage.objects WHERE bucket_id = $1', [otherBucket])).rows.length, 1);
      const { rows: [created] } = await db.query('INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2) RETURNING id',
        [otherBucket, `${role}-synthetic-new.png`]);
      assert.equal((await db.query('UPDATE storage.objects SET name = $1 WHERE id = $2 RETURNING id',
        [`${role}-synthetic-updated.png`, created.id])).rows.length, 1);
      assert.equal((await db.query('DELETE FROM storage.objects WHERE id = $1 RETURNING id', [created.id])).rows.length, 1);
    });
  });
}

test('trusted service role retains capture read, write, update, and cleanup access through existing RLS bypass', async () => {
  await seedObjects();
  await asRole('service_role', async () => {
    assert.equal((await db.query('SELECT * FROM storage.objects WHERE bucket_id = $1', [bucket])).rows.length, 1);
    assert.equal((await getBucket()).public, false);
    const { rows: [created] } = await db.query('INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2) RETURNING id',
      [bucket, 'synthetic-service-created.pdf']);
    assert.equal((await db.query('UPDATE storage.objects SET name = $1 WHERE id = $2 RETURNING id',
      ['synthetic-service-renamed.pdf', created.id])).rows.length, 1);
    assert.equal((await db.query('DELETE FROM storage.objects WHERE id = $1 RETURNING id', [created.id])).rows.length, 1);
  });
});
