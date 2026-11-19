// @vitest-environment node
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it, vi } from 'vitest'
import { parseSeekerCv, type CvSource } from '../src/lib/seeker-cv/parser'
import { extractPdfResume, PDF_EXTRACTION_LIMITS } from '../src/lib/employer-screening/pdf-extraction'
import { runCvBatch, cvBackfillStore } from '../src/lib/seeker-cv/backfill'
import { candidateKeywordFilter, candidateMatchesSkills } from '../src/lib/candidate-search'
import { GET } from '../src/app/api/cron/seeker-cv-skills/route'
import { NextRequest } from 'next/server'

const require = createRequire(import.meta.url)
const PDFDocument = require('pdfkit')
async function pdf(text: string): Promise<Uint8Array> {
  const doc = new PDFDocument({ compress: true })
  const chunks: Buffer[] = []
  const done = new Promise<Uint8Array>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
  })
  if (text) doc.text(text)
  else doc.rect(30, 30, 60, 60).fill('#aabbcc')
  doc.end()
  return done
}
const profile: CvSource = { id: '1', user_id: '11111111-1111-4111-8111-111111111111',
  cv_url: '11111111-1111-4111-8111-111111111111/cv.pdf', updated_at: '2026-11-16T00:00:00Z', cv_parse_status: 'pending', cv_parsed_at: null }
const download = (text: string) => async () => pdf(text)

it('parses real PDF skills and work claims, canonicalizes aliases, deduplicates and retains only derived titles', async () => {
  const result = await parseSeekerCv(profile, download('Jane Smith\njane@example.test\nSkills\nExcel, Microsoft Excel, customer support\nWork Experience\nRole: Cleaner\nCleaned guest rooms\nCleaned guest rooms'))
  expect(result.cv_parse_status).toBe('parsed')
  expect(result.cv_skills).toEqual(['Customer service', 'Housekeeping', 'Microsoft Excel'])
  expect(result.cv_roles).toEqual(['cleaner'])
  expect(result.cv_parsed_at).toBeTruthy()
  expect(JSON.stringify(result)).not.toMatch(/Jane|example|Cleaned guest rooms/)
})

it('maps no CV, empty PDFs, unsupported documents, invalid paths and corrupt PDFs honestly', async () => {
  const unused = vi.fn()
  expect((await parseSeekerCv({ ...profile, cv_url: null }, unused)).cv_parse_status).toBe('no_cv')
  expect((await parseSeekerCv({ ...profile, cv_url: 'another-user/cv.pdf' }, unused)).cv_parse_status).toBe('unreadable')
  expect((await parseSeekerCv({ ...profile, cv_url: profile.cv_url!.replace('.pdf', '.docx') }, unused)).cv_parse_status).toBe('unreadable')
  expect(unused).not.toHaveBeenCalled()
  expect((await parseSeekerCv(profile, download(''))).cv_parse_status).toBe('empty')
  expect((await parseSeekerCv(profile, async () => new Uint8Array([1, 2]))).cv_parse_status).toBe('unreadable')
  expect((await parseSeekerCv(profile, async () => null)).cv_parse_status).toBe('unreadable')
  expect((await parseSeekerCv(profile, download('Unknown vocabulary only'))).cv_parse_status).toBe('unreadable')
})

it('never promotes negative, third-party or training claims and never takes roles from objectives', async () => {
  for (const text of ['Work Experience\nMy supervisor cleaned guest rooms', 'Work Experience\nI did not clean guest rooms',
    'Work Experience\nTraining to clean guest rooms', 'Objective\nCleaner', 'Work Experience\nCleaner jane@example.test']) {
    const result = await parseSeekerCv(profile, download(text))
    expect(result.cv_skills).toEqual([])
    expect(result.cv_roles).toEqual([])
    expect(result.cv_parse_status).toBe('unreadable')
  }
})

it('leaves transient failures pending and rejects oversized bytes before invoking the parser', async () => {
  expect((await parseSeekerCv(profile, async () => { throw new Error('private details') })).cv_parse_status).toBe('pending')
  const extractor = vi.fn<typeof extractPdfResume>(async (_bytes, options) => {
    options?.onDiagnostic?.('pdf_capacity_unavailable')
    return null
  })
  expect((await parseSeekerCv(profile, async () => new Uint8Array(1), extractor)).cv_parse_status).toBe('pending')
  extractor.mockClear()
  expect((await parseSeekerCv(profile, async () => new Uint8Array(PDF_EXTRACTION_LIMITS.bytes + 1), extractor)).cv_parse_status).toBe('unreadable')
  expect(extractor).not.toHaveBeenCalled()
})

it('skips terminal profiles, bounds batches, and handles source races without counting a stale parse', async () => {
  const save = vi.fn(async () => false)
  const fetch = vi.fn(async () => null)
  const summary = await runCvBatch({ pending: async () => [
    { ...profile, cv_parse_status: 'parsed', cv_parsed_at: new Date().toISOString() },
    ...Array.from({ length: 15 }, () => ({ ...profile, cv_url: null })),
  ], download: fetch, save, remaining: async () => 15 })
  expect(save).toHaveBeenCalledTimes(9)
  expect(fetch).not.toHaveBeenCalled()
  expect(summary).toEqual({ counts: { parsed: 0, no_cv: 0, unreadable: 0, empty: 0, pending: 0 }, skipped: 10, remaining: 15, done: false })
})

it('rejects cron calls with absent or invalid secrets before accessing storage', async () => {
  const original = process.env.CRON_SECRET
  try {
    delete process.env.CRON_SECRET
    expect((await GET(new NextRequest('http://localhost/api/cron/seeker-cv-skills'))).status).toBe(401)
    process.env.CRON_SECRET = 'test-secret'
    expect((await GET(new NextRequest('http://localhost/api/cron/seeker-cv-skills', { headers: { authorization: 'Bearer test-secrex' } }))).status).toBe(401)
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  }
})

it('streams storage downloads within the byte limit and cancels oversized streams', async () => {
  const cancel = vi.fn()
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(PDF_EXTRACTION_LIMITS.bytes + 1))
  }, cancel })
  const asStream = vi.fn(async () => ({ data: stream, error: null }))
  const client = { storage: { from: vi.fn(() => ({ download: vi.fn(() => ({ asStream })) })) } }
  const store = cvBackfillStore(client as unknown as Parameters<typeof cvBackfillStore>[0])
  expect(await store.download('owner/cv.pdf')).toBeNull()
  expect(cancel).toHaveBeenCalledOnce()
})

describe('migration, queue idempotency and Browse Candidates', () => {
  it('invalidates only changed CVs, drains repeatedly, and matches derived arrays with substring SQL', async () => {
    const db = new PGlite()
    try {
      await db.exec(`CREATE TABLE public.seeker_profiles (id text PRIMARY KEY, user_id text, cv_url text,
        updated_at timestamptz DEFAULT now(), skills text[]);
        INSERT INTO public.seeker_profiles (id, user_id, cv_url, skills) VALUES
        ('1', '${profile.user_id}', '${profile.cv_url}', '{}');`)
      const migration = readFileSync('supabase/migrations/20261116000000_seeker_cv_skills.sql', 'utf8')
      await db.exec(migration)
      await db.exec(migration)
      const fetch = vi.fn(download('Skills\nExcel\nWork Experience\nCleaner'))
      const store = {
        pending: async () => (await db.query<CvSource>("SELECT * FROM seeker_profiles WHERE cv_parse_status = 'pending' ORDER BY id LIMIT 10")).rows,
        download: fetch,
        save: async (source: CvSource, result: Awaited<ReturnType<typeof parseSeekerCv>>) => {
          const updated = await db.query(`UPDATE seeker_profiles SET cv_skills = $1, cv_roles = $2, cv_parse_status = $3, cv_parsed_at = $4
            WHERE id = $5 AND cv_url IS NOT DISTINCT FROM $6 AND cv_parse_status = 'pending' RETURNING id`,
          [result.cv_skills, result.cv_roles, result.cv_parse_status, result.cv_parsed_at, source.id, source.cv_url])
          return updated.rows.length > 0
        },
        remaining: async () => (await db.query<{ count: number }>("SELECT count(*)::int AS count FROM seeker_profiles WHERE cv_parse_status = 'pending'")).rows[0].count,
      }
      expect((await runCvBatch(store)).counts.parsed).toBe(1)
      expect((await runCvBatch(store)).done).toBe(true)
      expect(fetch).toHaveBeenCalledOnce()
      await db.exec("UPDATE seeker_profiles SET updated_at = now()")
      await runCvBatch(store)
      expect(fetch).toHaveBeenCalledOnce()
      for (const term of ['excel', 'CLEAN']) {
        expect((await db.query('SELECT id FROM seeker_profiles p WHERE candidate_skill_search(p) ILIKE $1', [`%${term}%`])).rows).toHaveLength(1)
      }
      await db.exec(`UPDATE seeker_profiles SET cv_url = '${profile.user_id}/replacement.pdf'`)
      expect((await db.query('SELECT cv_skills,cv_roles,cv_parse_status,cv_parsed_at FROM seeker_profiles')).rows).toEqual([
        { cv_skills: [], cv_roles: [], cv_parse_status: 'pending', cv_parsed_at: null },
      ])
      expect((await runCvBatch(store)).counts.parsed).toBe(1)
      expect(fetch).toHaveBeenCalledTimes(2)
      await db.exec('UPDATE seeker_profiles SET cv_url = NULL')
      expect((await runCvBatch(store)).counts.no_cv).toBe(1)
      expect((await runCvBatch(store)).done).toBe(true)
      await expect(db.exec("UPDATE seeker_profiles SET cv_parse_status = 'fake'")).rejects.toThrow()
    } finally { await db.close() }
  }, 30_000)

  it('keeps query escaping and OR skill-filter behavior across typed and derived sources', () => {
    expect(candidateKeywordFilter('clean')).toContain('candidate_skill_search.ilike."%clean%"')
    expect(candidateKeywordFilter('Chef, Line')).toContain('bio.ilike."%Chef, Line%"')
    expect(candidateMatchesSkills({ cv_skills: ['Microsoft Excel'] }, ['excel'])).toBe(true)
    expect(candidateMatchesSkills({ cv_roles: ['cleaner'] }, ['clean'])).toBe(true)
    expect(candidateMatchesSkills({ skills: ['Cooking'] }, ['cook', 'excel'])).toBe(true)
    expect(candidateMatchesSkills({}, ['clean'])).toBe(false)
  })
})
