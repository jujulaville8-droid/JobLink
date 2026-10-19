// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { approvedWritingTerms } from '@/lib/resume-writing-terms';
const m=vi.hoisted(()=>({auth:vi.fn(),limit:vi.fn(),reader:vi.fn(),account:vi.fn(),price:vi.fn(),product:vi.fn(),link:vi.fn(),missing:vi.fn(),from:vi.fn(),bucket:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/api-auth',()=>({requireAdmin:m.auth}));
vi.mock('@/lib/resume-writing-server',()=>({writingLimit:m.limit,writingConfig:()=>({terms:approvedWritingTerms}),writingJson:(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:m.from,storage:{getBucket:m.bucket}})}));
vi.mock('@/lib/resume-writing-stripe',()=>({resumeWritingPolicy:()=>({mode:'live',accountId:'acct_fixture',priceId:'price_fixture',productId:'prod_fixture',paymentLinkId:'plink_fixture',paymentLinkUrl:'https://buy.stripe.com/fixture',livemode:true}),getResumeWritingStripe:m.reader,getResumeWritingWebhookSecret:()=> 'whsec_SyntheticReadiness'}));
import { GET } from '@/app/api/admin/resume-writing/readiness/route';
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv('RESUME_WRITING_LIVE_SECRET_KEY','rk_live_SyntheticReadiness');
  m.auth.mockResolvedValue({user:{id:'admin'}});m.limit.mockResolvedValue(null);
  m.account.mockResolvedValue({id:'acct_fixture'});m.price.mockResolvedValue({id:'price_fixture',active:true,livemode:true,type:'one_time',currency:'xcd',unit_amount:5000,product:'prod_fixture'});
  m.product.mockResolvedValue({id:'prod_fixture',active:true,livemode:true});m.link.mockResolvedValue({id:'plink_fixture',active:false,livemode:true,url:'https://buy.stripe.com/fixture',line_items:{has_more:false,data:[{quantity:1,price:{id:'price_fixture'}}]},automatic_tax:{enabled:false},allow_promotion_codes:false,shipping_options:[]});
  m.missing.mockRejectedValue(new Stripe.errors.StripeInvalidRequestError({type:'invalid_request_error',code:'resource_missing',message:'Synthetic missing object'}));
  m.reader.mockReturnValue({accounts:{retrieve:m.account},prices:{retrieve:m.price},products:{retrieve:m.product},paymentLinks:{retrieve:m.link},checkout:{sessions:{retrieve:m.missing}},paymentIntents:{retrieve:m.missing},charges:{retrieve:m.missing}});
  m.from.mockReturnValue({select:()=>({limit:async()=>({error:null,data:[]})})});m.bucket.mockResolvedValue({data:{public:false,file_size_limit:3145728,allowed_mime_types:['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']},error:null});
});
afterEach(()=>vi.unstubAllEnvs());
it('requires current admin before any credential, database or provider check',async()=>{
  m.auth.mockResolvedValue({error:Response.json({error:'Forbidden'},{status:403})});expect((await GET()).status).toBe(403);expect(m.reader).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled();expect(m.limit).not.toHaveBeenCalled();
});
it('rate limits checks before constructing the Stripe reader',async()=>{
  m.limit.mockResolvedValue(Response.json({error:'Too many requests'},{status:429}));expect((await GET()).status).toBe(429);expect(m.reader).not.toHaveBeenCalled();
});
it('returns only safe check results and distinguishes local signing from endpoint binding',async()=>{
  const r=await GET(),body=await r.json();expect(r.headers.get('cache-control')).toContain('no-store');expect(body.configurationReady).toBe(true);expect(body.linkActive).toBe(false);expect(body.webhookBinding).toContain('does not prove');expect(JSON.stringify(body)).not.toMatch(/rk_live_|whsec_|Synthetic|secret_key/);expect(m.missing).toHaveBeenCalledTimes(3);
});
it('fails closed on a wrong account, package, schema or public bucket',async()=>{
  m.account.mockResolvedValue({id:'wrong'});m.price.mockResolvedValue({unit_amount:1});m.bucket.mockResolvedValue({data:{public:true},error:null});const body=await(await GET()).json();expect(body.configurationReady).toBe(false);expect(body.checks.account).toBe(false);expect(body.checks.price).toBe(false);expect(body.checks.privateBucket).toBe(false);
});
it('never returns raw provider errors or credentials',async()=>{
  m.account.mockRejectedValue(new Error('Synthetic sensitive provider details'));const r=await GET();expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toMatch(/Synthetic|rk_live_|whsec_/);
});
