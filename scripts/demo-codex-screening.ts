/** Dry run only. Deliberately no live/execute mode and no credentials. */
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { boundedSubprocess, probeSyntheticCodex, codexOutputSchema } from './employer-screening/codex-synthetic'
async function main() {
  if (process.argv.length > 2) throw new Error('This script accepts no arguments and supports only the local mock.')
  const dir = await mkdtemp(join(tmpdir(), 'joblink-synthetic-'))
  try {
    const schemaPath = join(dir, 'output.schema.json')
    await writeFile(schemaPath, JSON.stringify(codexOutputSchema, null, 2))
    const report = await probeSyntheticCodex((invocation, signal) => boundedSubprocess(
      process.execPath, [resolve('scripts/employer-screening/mock-codex.mjs')], invocation.stdin, dir, signal,
    ), schemaPath)
    if (report.status !== 'scored') throw new Error('Mock probe failed')
    await mkdir('artifacts/employer-screening', { recursive: true })
    await writeFile('artifacts/employer-screening/codex-mock-report.json', JSON.stringify({
      mode: 'LOCAL_MOCK_NOT_AI', authenticated: false, realApplicantData: false, report,
    }, null, 2))
    console.log('Local mock subprocess passed. Codex not invoked; no account, API or email used.')
  } finally { await rm(dir, { recursive: true, force: true }) }
}
void main()
