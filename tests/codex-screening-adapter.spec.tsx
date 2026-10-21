// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { boundedSubprocess, buildSyntheticInvocation, probeSyntheticCodex, codexOutputSchema } from '../scripts/employer-screening/codex-synthetic'
const valid = { assessments: [
  { criterionId: 'records', finding: 'supported', evidenceIds: ['excel'] },
  { criterionId: 'service', finding: 'supported', evidenceIds: ['orders'] },
  { criterionId: 'certificate', finding: 'unknown', evidenceIds: [] },
] }
const probe = (value: unknown) => probeSyntheticCodex(async () => JSON.stringify(value), '/synthetic/output.json')
describe('synthetic Codex boundary', () => {
  it('constructs a read-only ephemeral noninteractive invocation without API/auth configuration', () => {
    const i = buildSyntheticInvocation('/fixture/schema.json')
    expect(i.command).toBe('codex')
    expect(i.args).toEqual(['-a', 'never', 'exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--color', 'never', '--output-schema', '/fixture/schema.json', '-'])
    expect(i.stdin).toContain('entirely fictional fixture')
    expect(i.stdin).not.toContain('applicationId')
    expect(codexOutputSchema).toMatchObject({ type: 'object', additionalProperties: false })
  })
  it('validates evidence and calculates score locally', async () => {
    expect(await probe(valid)).toMatchObject({ status: 'scored', supportedPoints: 70, unresolvedPoints: 30 })
  })
  it.each([
    { ...valid, score: 100 },
    { assessments: valid.assessments.slice(0, 2) },
    { assessments: [valid.assessments[0], valid.assessments[0], valid.assessments[2]] },
    { assessments: [{ ...valid.assessments[0], evidenceIds: ['orders'] }, ...valid.assessments.slice(1)] },
    { assessments: [{ ...valid.assessments[0], evidenceIds: ['invented'] }, ...valid.assessments.slice(1)] },
    { assessments: [{ ...valid.assessments[0], finding: 'unknown' }, ...valid.assessments.slice(1)] },
  ])('rejects malformed, invented, incomplete or category-mismatched findings', async value => {
    expect(await probe(value)).toEqual({ status: 'unavailable' })
  })
  it('fails open on malformed JSON, oversized results and process errors', async () => {
    for (const run of [async () => 'not-json', async () => ' '.repeat(32_769), async () => { throw new Error('private diagnostic') }]) {
      expect(await probeSyntheticCodex(run, '/fixture/schema.json')).toEqual({ status: 'unavailable' })
    }
  })
  it('returns promptly on timeout even if injected runner ignores abort', async () => {
    let signal: AbortSignal | undefined
    const result = await probeSyntheticCodex(async (_, s) => { signal = s; return new Promise(() => {}) }, '/fixture/schema.json', { timeoutMs: 5 })
    expect(result).toEqual({ status: 'unavailable' })
    expect(signal?.aborted).toBe(true)
  })
  it('does not start a pre-aborted request', async () => {
    let called = false
    const controller = new AbortController(); controller.abort()
    expect(await probeSyntheticCodex(async () => { called = true; return '' }, '', { signal: controller.signal })).toEqual({ status: 'unavailable' })
    expect(called).toBe(false)
  })
  it('rejects invalid timeout budgets', async () => {
    await expect(probeSyntheticCodex(async () => '', '', { timeoutMs: 0 })).rejects.toThrow('Invalid probe timeout')
  })
})
describe('real subprocess mechanics with fake local executable only', () => {
  it('runs fixed mock input/output through a real child process', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'joblink-adapter-test-'))
    try {
      const result = await probeSyntheticCodex((i, signal) => boundedSubprocess(process.execPath,
        [resolve('scripts/employer-screening/mock-codex.mjs')], i.stdin, dir, signal), '/fixture/schema.json')
      expect(result).toMatchObject({ status: 'scored', supportedPoints: 70 })
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
  it('does not inherit credential-bearing environment variables', async () => {
    process.env.JOBLINK_SYNTHETIC_SECRET = 'not-a-real-secret'
    try {
      const result = await boundedSubprocess(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.env))'], '', tmpdir(), new AbortController().signal)
      expect(JSON.parse(result)).toEqual({ NODE_ENV: 'test' })
    } finally { delete process.env.JOBLINK_SYNTHETIC_SECRET }
  })
  it('bounds stdout and stderr and rejects unsuccessful exits', async () => {
    for (const script of ["process.stdout.write('x'.repeat(40000))", "process.stderr.write('x'.repeat(40000))", 'process.exit(3)']) {
      await expect(boundedSubprocess(process.execPath, ['-e', script], '', tmpdir(), new AbortController().signal)).rejects.toThrow()
    }
  })
  it('aborts and terminates a stalled process', async () => {
    const controller = new AbortController()
    const running = boundedSubprocess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], '', tmpdir(), controller.signal)
    setTimeout(() => controller.abort(), 20)
    await expect(running).rejects.toThrow('Aborted')
  })
})
