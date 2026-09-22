/** Read-only by default. Run with --apply only after reviewing the report on a restored database. */
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { normalizeStripeEvent } from '../src/lib/stripe-events'

async function main() {
  const args=process.argv.slice(2)
  const from=args[args.indexOf('--from')+1]
  const to=args[args.indexOf('--to')+1]
  if (!args.includes('--from') || !args.includes('--to') || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) {
    throw new Error('Usage: npx tsx scripts/reconcile-stripe.ts --from ISO_DATE --to ISO_DATE [--apply]')
  }
  const required=['STRIPE_SECRET_KEY','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']
  if (required.some(k=>!process.env[k])) throw new Error('Missing required reconciliation environment variables')
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion:'2026-02-25.clover' })
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
  const supported=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.payment_succeeded','invoice.payment_failed'])
  const report=[]
  for await (const event of stripe.events.list({created:{gte:Math.floor(Date.parse(from)/1000),lt:Math.floor(Date.parse(to)/1000)},limit:100})) {
    if (!supported.has(event.type)) continue
    const {data,error}=await admin.from('stripe_events').select('id').eq('id',event.id).maybeSingle()
    if(error) throw error
    if(data) { report.push({id:event.id,type:event.type,status:'recorded'});continue }
    if(!args.includes('--apply')) {report.push({id:event.id,type:event.type,status:'needs_reconciliation'});continue}
    const normalized=await normalizeStripeEvent(event,stripe)
    const {error:applyError}=await admin.rpc('process_stripe_event',{p_event:normalized})
    report.push({id:event.id,type:event.type,status:applyError?'failed':'reconciled'})
    if(applyError) process.exitCode=1
  }
  console.log(JSON.stringify({mode:args.includes('--apply')?'apply':'read-only',events:report},null,2))
}
main().catch(()=>{console.error('Reconciliation failed. Check service access and schema; no secrets logged.');process.exitCode=1})
