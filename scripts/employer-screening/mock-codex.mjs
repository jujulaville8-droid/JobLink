// Fixed local fake, never calls Codex, AI, network, email or account services.
let input = ''
for await (const chunk of process.stdin) input += chunk
if (!input.includes('entirely fictional fixture')) process.exit(2)
process.stdout.write(JSON.stringify({ assessments: [
  { criterionId: 'records', finding: 'supported', evidenceIds: ['excel'] },
  { criterionId: 'service', finding: 'supported', evidenceIds: ['orders'] },
  { criterionId: 'certificate', finding: 'unknown', evidenceIds: [] },
] }))
