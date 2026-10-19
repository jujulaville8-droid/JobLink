// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getResumeWritingStripe, getResumeWritingWebhookSecret, resumeWritingPolicy } from '@/lib/resume-writing-stripe';
import { inspectResumeWritingSession } from '@/lib/resume-writing-payment';
import { writingId, writingSession } from './fixtures/resume-writing';
import { sandboxEnv } from './fixtures/resume-writing-sandbox';
beforeEach(()=>{for(const [key,value]of Object.entries(sandboxEnv))vi.stubEnv(key,value);});
afterEach(()=>vi.unstubAllEnvs());
const reader=(session=writingSession(writingId,'Sandbox',resumeWritingPolicy()))=>{
  const account=vi.fn(async()=>({id:resumeWritingPolicy().accountId}));const retrieve=vi.fn(async()=>session);
  return {account,retrieve,client:{accounts:{retrieve:account},checkout:{sessions:{retrieve}},paymentLinks:{}} as unknown as Parameters<typeof inspectResumeWritingSession>[0]};
};
it('fails closed for missing mode or incomplete sandbox pins without falling back to live',()=>{
  vi.stubEnv('RESUME_WRITING_PAYMENT_MODE','');expect(()=>resumeWritingPolicy()).toThrow();
  vi.stubEnv('RESUME_WRITING_PAYMENT_MODE','sandbox');vi.stubEnv('RESUME_WRITING_SANDBOX_PRICE_ID','');expect(()=>resumeWritingPolicy()).toThrow();
});
it.each(['https://example.com/test_Example','https://buy.stripe.com/liveExample','https://buy.stripe.com/test_Example?prefilled_email=someone@example.com'])('rejects a noncanonical sandbox URL %s',url=>{vi.stubEnv('RESUME_WRITING_SANDBOX_PAYMENT_LINK_URL',url);expect(()=>resumeWritingPolicy()).toThrow();});
it('uses separate mode-matched credentials and never falls back to the employer key',()=>{
  vi.stubEnv('STRIPE_SECRET_KEY','sk_test_SyntheticEmployer');vi.stubEnv('STRIPE_WEBHOOK_SECRET','whsec_SyntheticEmployer');
  expect(()=>getResumeWritingStripe()).toThrow('resume_payment_not_configured');expect(()=>getResumeWritingWebhookSecret()).toThrow('resume_webhook_not_configured');
  vi.stubEnv('RESUME_WRITING_SANDBOX_SECRET_KEY','sk_live_SyntheticWrongMode');expect(()=>getResumeWritingStripe()).toThrow('resume_payment_not_configured');
  vi.stubEnv('RESUME_WRITING_SANDBOX_SECRET_KEY','rk_test_SyntheticOnly');vi.stubEnv('RESUME_WRITING_SANDBOX_WEBHOOK_SECRET','whsec_SyntheticSandbox');
  expect(getResumeWritingStripe()).toBeTruthy();expect(getResumeWritingWebhookSecret()).toBe('whsec_SyntheticSandbox');
  vi.stubEnv('RESUME_WRITING_PAYMENT_MODE','live');expect(()=>getResumeWritingStripe()).toThrow('resume_payment_not_configured');expect(()=>getResumeWritingWebhookSecret()).toThrow('resume_webhook_not_configured');
  vi.stubEnv('RESUME_WRITING_LIVE_SECRET_KEY','rk_test_SyntheticWrongMode');expect(()=>getResumeWritingStripe()).toThrow('resume_payment_not_configured');
  vi.stubEnv('RESUME_WRITING_LIVE_SECRET_KEY','rk_live_SyntheticOnly');vi.stubEnv('RESUME_WRITING_LIVE_WEBHOOK_SECRET','whsec_SyntheticLive');
  expect(getResumeWritingStripe()).toBeTruthy();expect(getResumeWritingWebhookSecret()).toBe('whsec_SyntheticLive');
});
it('accepts authoritative sandbox sessions under the complete server-only sandbox policy',async()=>{const stripe=reader();expect(await inspectResumeWritingSession(stripe.client,'cs_test_Sandbox')).toMatchObject({state:'paid',sessionId:'cs_test_Sandbox'});expect(stripe.retrieve).toHaveBeenCalledOnce();});
it('rejects cross-mode session IDs before any provider access',async()=>{
  const stripe=reader();await expect(inspectResumeWritingSession(stripe.client,'cs_live_Example')).rejects.toThrow('unverified_payment');expect(stripe.account).not.toHaveBeenCalled();
  vi.stubEnv('RESUME_WRITING_PAYMENT_MODE','live');await expect(inspectResumeWritingSession(stripe.client,'cs_test_Sandbox')).rejects.toThrow('unverified_payment');expect(stripe.account).not.toHaveBeenCalled();
});
it('rejects a test-prefixed session with live provider facts or the wrong merchant',async()=>{
  const session=writingSession(writingId,'Sandbox',resumeWritingPolicy());session.livemode=true;let stripe=reader(session);
  await expect(inspectResumeWritingSession(stripe.client,session.id)).rejects.toThrow('unverified_payment');
  session.livemode=false;stripe=reader(session);stripe.account.mockResolvedValueOnce({id:'acct_WrongMerchant'});
  await expect(inspectResumeWritingSession(stripe.client,session.id)).rejects.toThrow('unverified_payment');
});
