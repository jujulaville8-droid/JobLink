import 'server-only';
import Stripe from 'stripe';
import { z } from 'zod';

// Approved staged live resources. A sandbox can never fall back to these pins.
export const resumeWritingPayment = {
  accountId:'acct_1TChXLCucQcu2n8C', paymentLinkId:'plink_1UR4MHCucQcu2n8CMrna7wGD',
  paymentLinkUrl:'https://buy.stripe.com/4gM00igUY0m7eWKdyecV200',
  priceId:'price_1UR4M8CucQcu2n8Cq3fsP01o', productId:'joblink_first_resume_xcd50_v1',
  currency:'xcd', amount:5000, livemode:true,
} as const;
export type WritingPaymentPolicy = {
  mode:'sandbox'|'live'; accountId:string; paymentLinkId:string; paymentLinkUrl:string;
  priceId:string; productId:string; currency:'xcd'; amount:5000; livemode:boolean; key:string;
};
const sandboxPins = z.object({
  accountId:z.string().regex(/^acct_[A-Za-z0-9]+$/).max(128),
  paymentLinkId:z.string().regex(/^plink_[A-Za-z0-9]+$/).max(128),
  priceId:z.string().regex(/^price_[A-Za-z0-9]+$/).max(128),
  productId:z.string().regex(/^[A-Za-z0-9_]+$/).min(1).max(128),
  paymentLinkUrl:z.string().regex(/^https:\/\/buy\.stripe\.com\/test_[A-Za-z0-9]+$/).max(200),
});
export function resumeWritingPolicy(): WritingPaymentPolicy {
  const mode=process.env.RESUME_WRITING_PAYMENT_MODE;
  if(mode!=='sandbox'&&mode!=='live')throw new Error('resume_payment_not_configured');
  const pins=mode==='live'?resumeWritingPayment:sandboxPins.parse({
    accountId:process.env.RESUME_WRITING_SANDBOX_ACCOUNT_ID,
    paymentLinkId:process.env.RESUME_WRITING_SANDBOX_PAYMENT_LINK_ID,
    paymentLinkUrl:process.env.RESUME_WRITING_SANDBOX_PAYMENT_LINK_URL,
    priceId:process.env.RESUME_WRITING_SANDBOX_PRICE_ID,
    productId:process.env.RESUME_WRITING_SANDBOX_PRODUCT_ID,
  });
  const policy:Omit<WritingPaymentPolicy,'key'>={...pins,mode,currency:'xcd',amount:5000,livemode:mode==='live'};
  // Immutable order binding includes mode and every approved resource, not keys.
  const key=JSON.stringify([mode,policy.accountId,policy.paymentLinkId,policy.priceId,policy.productId,policy.paymentLinkUrl,policy.currency,policy.amount]);
  return {...policy,key};
}
export function resumeWritingSessionId(value:string) {
  const p=resumeWritingPolicy();
  return (p.livemode?/^cs_live_[A-Za-z0-9]+$/:/^cs_test_[A-Za-z0-9]+$/).test(value);
}
export function getResumeWritingStripe(): Stripe {
  const p=resumeWritingPolicy();
  const key=process.env[p.livemode?'RESUME_WRITING_LIVE_SECRET_KEY':'RESUME_WRITING_SANDBOX_SECRET_KEY'];
  if(!key||!(p.livemode?/^(sk|rk)_live_[A-Za-z0-9]+$/:/^(sk|rk)_test_[A-Za-z0-9]+$/).test(key))throw new Error('resume_payment_not_configured');
  // Keep the repository's installed SDK/API contract; no employer-key fallback.
  return new Stripe(key,{apiVersion:'2026-02-25.clover'});
}
export function getResumeWritingWebhookSecret() {
  const p=resumeWritingPolicy();
  const secret=process.env[p.livemode?'RESUME_WRITING_LIVE_WEBHOOK_SECRET':'RESUME_WRITING_SANDBOX_WEBHOOK_SECRET'];
  if(!secret||!/^whsec_[A-Za-z0-9]+$/.test(secret))throw new Error('resume_webhook_not_configured');
  return secret;
}
