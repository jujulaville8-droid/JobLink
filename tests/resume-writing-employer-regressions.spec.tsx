// @vitest-environment node
// Adapted from the independent reviewer. No provider calls: real local signature validation and résumé dispatch, mocked employer storage.
import Stripe from 'stripe';
import { sandboxEnv } from './fixtures/resume-writing-sandbox';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const b=vi.hoisted(()=>({from:vi.fn(),retrieve:vi.fn(),writes:[] as {table:string;kind:string;value:unknown}[]}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/stripe',()=>({getStripe:()=>({webhooks:Stripe.webhooks,subscriptions:{retrieve:b.retrieve}})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:b.from})}));
import { POST } from '@/app/api/webhooks/stripe/route';
const secret='synthetic-review-signing-value';
beforeEach(()=>{
  vi.clearAllMocks(); b.writes=[];
  for(const [key,value]of Object.entries(sandboxEnv))vi.stubEnv(key,value);
  vi.stubEnv('RESUME_WRITING_SANDBOX_WEBHOOK_SECRET','whsec_SyntheticSandbox');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET',secret); vi.stubEnv('RESUME_WRITING_ENABLED','true');
  b.retrieve.mockResolvedValue({id:'sub_synthetic',status:'active',items:{data:[{current_period_end:1800000000}]}});
  b.from.mockImplementation((table:string)=>({
    insert:async(value:unknown)=>{b.writes.push({table,kind:'insert',value});return{error:null};},
    update:(value:unknown)=>({eq:async()=>{b.writes.push({table,kind:'update',value});return{error:null};}}),
    upsert:async(value:unknown)=>{b.writes.push({table,kind:'upsert',value});return{error:null};},
  }));
});
afterEach(()=>vi.unstubAllEnvs());
async function deliver(type:string,object:unknown) {
  const payload=JSON.stringify({id:`evt_synthetic_${type}`,type,data:{object}});
  const signature=Stripe.webhooks.generateTestHeaderString({payload,secret});
  return POST(new NextRequest('https://joblink.test/api/webhooks/stripe',{method:'POST',body:payload,headers:{'stripe-signature':signature}}));
}
it('keeps employer checkout and subscription upsert outside résumé reconciliation',async()=>{
  expect((await deliver('checkout.session.completed',{id:'cs_test_Employer',payment_link:null,subscription:'sub_synthetic',customer:'cus_synthetic',metadata:{company_id:'synthetic-company'}})).status).toBe(200);
  expect(b.writes).toEqual(expect.arrayContaining([
    expect.objectContaining({table:'companies',kind:'update',value:{is_pro:true,stripe_customer_id:'cus_synthetic'}}),
    expect.objectContaining({table:'subscriptions',kind:'upsert'}),
  ]));
  expect(b.from.mock.calls.every(([table])=>!String(table).startsWith('resume_writing'))).toBe(true);
});
it('keeps employer invoice renewal processing outside résumé reconciliation',async()=>{
  expect((await deliver('invoice.payment_succeeded',{parent:{subscription_details:{subscription:'sub_synthetic'}},customer:'cus_synthetic'})).status).toBe(200);
  expect(b.writes).toEqual(expect.arrayContaining([expect.objectContaining({table:'subscriptions',kind:'update'}),expect.objectContaining({table:'companies',value:{is_pro:true}})]));
});
it('keeps employer cancellation entitlement revocation outside résumé reconciliation',async()=>{
  expect((await deliver('customer.subscription.deleted',{id:'sub_synthetic',customer:'cus_synthetic'})).status).toBe(200);
  expect(b.writes).toEqual(expect.arrayContaining([expect.objectContaining({table:'subscriptions',value:{status:'canceled'}}),expect.objectContaining({table:'companies',value:{is_pro:false}})]));
});
