import { spawn } from 'node:child_process'

const baseUrl = 'http://127.0.0.1:3000'
const child = spawn('npm', ['run', 'dev'], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
child.stdout.on('data', (chunk) => {
  serverOutput += chunk
})
child.stderr.on('data', (chunk) => {
  serverOutput += chunk
})

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(baseUrl)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw new Error(`Local server did not start.\n${serverOutput}`)
}

async function probe(label, path, options = {}, expectedStatuses = [200]) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    ...options,
  })
  const status = response.status
  const location = response.headers.get('location') || ''
  console.log(`${label.padEnd(42)} status=${status}${location ? ` location=${location}` : ''}`)

  if (!expectedStatuses.includes(status)) {
    throw new Error(`${label} returned ${status}; expected ${expectedStatuses.join(' or ')}`)
  }
}

try {
  await waitForServer()

  await probe('GET /', '/')
  await probe('GET /jobs', '/jobs')
  await probe('GET /about', '/about')
  await probe('GET /login', '/login')
  await probe('GET /signup?role=employer', '/signup?role=employer')
  await probe('GET /jobs/not-a-real-job-id', '/jobs/not-a-real-job-id')
  await probe('GET /companies/not-a-real-company-id', '/companies/not-a-real-company-id')

  await probe('GET /dashboard', '/dashboard', {}, [302, 303, 307, 308])
  await probe('GET /admin/approvals', '/admin/approvals', {}, [302, 303, 307, 308])
  await probe('GET /browse-jobs', '/browse-jobs', {}, [302, 303, 307, 308])

  const jsonPost = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }
  await probe('POST /api/profile', '/api/profile', jsonPost, [401])
  await probe('POST /api/jobs/apply', '/api/jobs/apply', jsonPost, [401])
  await probe('POST /api/messages/invite', '/api/messages/invite', jsonPost, [401])
  await probe('POST /api/switch-role', '/api/switch-role', jsonPost, [401])

  await probe('GET /api/cron/expire-listings', '/api/cron/expire-listings', {}, [401])
  await probe(
    'GET cron with spoofed x-vercel-cron',
    '/api/cron/expire-listings',
    { headers: { 'x-vercel-cron': '1' } },
    [401]
  )

  console.log('Smoke checks passed.')
} finally {
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}
