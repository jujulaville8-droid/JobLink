import { spawn } from 'node:child_process'
import { once } from 'node:events'
import assert from 'node:assert/strict'
const port = Number(process.env.SMOKE_PORT || 3188)
const baseUrl = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-p',String(port)], {
  stdio:['ignore','pipe','pipe'], env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:1',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-placeholder',MAINTENANCE_MODE:'false'},
})
let output=''; child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c)
async function probe(path,statuses,options={}) {
 const r=await fetch(`${baseUrl}${path}`,{redirect:'manual',...options})
 assert.ok(statuses.includes(r.status),`${path}: got ${r.status}, expected ${statuses}`)
 console.log(`${options.method || 'GET'} ${path}: ${r.status}`)
 return r
}
try {
 for(let i=0;i<60;i++) {try {await fetch(`${baseUrl}/api/health`);break}catch {if(i===59) throw new Error(output);await new Promise(r=>setTimeout(r,250))}}
 // Streaming HTML may have committed 200 before a render error. Health is the readiness signal.
 const home=await probe('/',[200,500]); const html=await home.text()
 assert.ok(html.includes('Temporarily unavailable') || html.includes('NEXT_ERROR') || home.status===500,'Outage must not render an empty home page')
 await probe('/api/health',[503])
 for(const path of ['/jobs','/about','/login','/signup?role=employer']) await probe(path,[200])
 for(const path of ['/jobs/not-a-real-job-id','/companies/not-a-real-company-id']) await probe(path,[404])
 for(const path of ['/dashboard','/admin/approvals','/browse-jobs']) await probe(path,[302,303,307,308])
 const json={method:'POST',headers:{'content-type':'application/json'},body:'{}'}
 for(const path of ['/api/profile','/api/jobs/apply','/api/messages/invite','/api/switch-role','/api/ai/resume']) await probe(path,[401],json)
 for(const path of ['/api/cron/expire-listings','/api/cron/email-outbox','/api/cron/signup-reminder','/api/cron/resume-nudge']) await probe(path,[401])
 await probe('/api/cron/expire-listings',[401],{headers:{'x-vercel-cron':'1'}})
 await probe('/api/webhooks/stripe',[400],json)
 console.log('Local production outage/auth smoke checks passed; no live services used.')
} finally {
 if(child.exitCode===null) {child.kill('SIGTERM');await once(child,'exit')}
}
