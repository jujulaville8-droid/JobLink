import { test } from 'node:test'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
import { NextRequest } from 'next/server'
import { POST } from '../src/app/api/webhooks/stripe/route'
import { normalizeStripeEvent } from '../src/lib/stripe-events'

process.env.STRIPE_SECRET_KEY='sk_test_local_placeholder'
process.env.STRIPE_WEBHOOK_SECRET='whsec_local_test'
process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:1'
process.env.SUPABASE_SERVICE_ROLE_KEY='local-placeholder'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const event = {id:'evt_test',type:'checkout.session.completed',created:100,data:{object:{id:'cs_test',payment_status:'paid',metadata:{purchase_type:'smart_resume',user_id:'00000000-0000-4000-8000-000000000001'}}}} as unknown as Stripe.Event
function request(signature?:string) {
 const payload=JSON.stringify(event)
 return new NextRequest('http://localhost/api/webhooks/stripe',{method:'POST',body:payload,headers:{'stripe-signature':signature ?? stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET!})}})
}
test('signed webhook returns a retryable failure when Supabase returns an error, then succeeds on retry',async()=>{
 const original=globalThis.fetch;let calls=0
 globalThis.fetch=async()=>{
  calls++
  return new Response(JSON.stringify(calls===1?{message:'Database unavailable',code:'08006'}:null),{status:calls===1?503:200,headers:{'Content-Type':'application/json'}})
 }
 try {
  assert.equal((await POST(request('invalid-signature'))).status,400)
  assert.equal(calls,0)
  assert.equal((await POST(request())).status,500)
  assert.equal((await POST(request())).status,200)
  assert.equal(calls,2)
 } finally { globalThis.fetch=original }
})
test('unpaid checkout does not grant a resume purchase',async()=>{
 const unpaid={...event,data:{object:{...event.data.object,payment_status:'unpaid'}}} as unknown as Stripe.Event
 assert.equal((await normalizeStripeEvent(unpaid,stripe)).kind,'ignored')
 assert.equal((await normalizeStripeEvent(event,stripe)).kind,'purchase')
})
