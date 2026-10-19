// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { sandboxEnv } from './fixtures/resume-writing-sandbox';
const b=vi.hoisted(()=>({construct:vi.fn(),handle:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/stripe',()=>({getStripe:()=>({webhooks:{constructEvent:b.construct}})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:b.from})}));
vi.mock('@/lib/resume-writing-payment',()=>({handleResumeWritingStripeEvent:b.handle}));
import { POST } from '@/app/api/webhooks/stripe/route';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('STRIPE_WEBHOOK_SECRET','fixture-only');b.construct.mockReturnValue({id:'evt_fixture',type:'checkout.session.completed',data:{object:{}}});b.handle.mockResolvedValue(true);b.from.mockReturnValue({insert:async()=>({error:null})});});
afterEach(()=>vi.unstubAllEnvs());
const request=(signature=true)=>new NextRequest('https://joblink.test/api/webhooks/stripe',{method:'POST',body:'fixture',headers:signature?{'stripe-signature':'fixture'}:{}});
it('handles résumé events before the legacy event claim or employer entitlement writes',async()=>{expect((await POST(request())).status).toBe(200);expect(b.handle).toHaveBeenCalledOnce();expect(b.from).not.toHaveBeenCalled();});
it('leaves failed résumé reconciliation retryable without a premature event claim',async()=>{b.handle.mockRejectedValueOnce(new Error());expect((await POST(request())).status).toBe(503);expect(b.from).not.toHaveBeenCalled();});
it('rejects missing/invalid signatures before résumé handling',async()=>{expect((await POST(request(false))).status).toBe(400);b.construct.mockImplementationOnce(()=>{throw new Error('invalid');});const spy=vi.spyOn(console,'error').mockImplementation(()=>{});expect((await POST(request())).status).toBe(400);spy.mockRestore();expect(b.handle).not.toHaveBeenCalled();});
it('preserves legacy processing for unrelated signed events',async()=>{b.handle.mockResolvedValueOnce(false);b.construct.mockReturnValueOnce({id:'evt_other',type:'customer.created',data:{object:{}}});expect((await POST(request())).status).toBe(200);expect(b.from).toHaveBeenCalledWith('stripe_webhook_events');});
function sandboxRequest(livemode=false,secret='whsec_SyntheticSandbox') {
  for(const [key,value]of Object.entries(sandboxEnv))vi.stubEnv(key,value);
  vi.stubEnv('RESUME_WRITING_ENABLED','true');vi.stubEnv('RESUME_WRITING_SANDBOX_WEBHOOK_SECRET','whsec_SyntheticSandbox');vi.stubEnv('STRIPE_WEBHOOK_SECRET','');
  const body=JSON.stringify({id:'evt_sandbox',type:'checkout.session.completed',livemode,data:{object:{id:'cs_test_Sandbox'}}});
  return new NextRequest('https://joblink.test/api/webhooks/stripe',{method:'POST',body,headers:{'stripe-signature':Stripe.webhooks.generateTestHeaderString({payload:body,secret})}});
}
it('verifies the independent sandbox signature without employer credentials or claims',async()=>{expect((await POST(sandboxRequest())).status).toBe(200);expect(b.construct).not.toHaveBeenCalled();expect(b.handle).toHaveBeenCalledOnce();expect(b.from).not.toHaveBeenCalled();});
it('rejects cross-mode or wrong-secret résumé signatures without granting employer entitlements',async()=>{
  expect((await POST(sandboxRequest(true))).status).toBe(400);expect(b.handle).not.toHaveBeenCalled();
  expect((await POST(sandboxRequest(false,'whsec_SyntheticWrong'))).status).toBe(400);expect(b.from).not.toHaveBeenCalled();
});
it('never sends unrelated sandbox-signed events through the employer entitlement flow',async()=>{b.handle.mockResolvedValueOnce(false);const response=await POST(sandboxRequest());expect(await response.json()).toMatchObject({received:true,ignored:true});expect(b.from).not.toHaveBeenCalled();expect(b.construct).not.toHaveBeenCalled();});
