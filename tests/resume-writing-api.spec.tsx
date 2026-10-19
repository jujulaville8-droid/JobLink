// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { writingAdmin, writingId, writingIntake, writingOrder, writingTerms, writingUser } from './fixtures/resume-writing';
import { resumeWritingPolicy } from '@/lib/resume-writing-stripe';
import { sandboxEnv } from './fixtures/resume-writing-sandbox';
const b=vi.hoisted(()=>({owner:vi.fn(),admin:vi.fn(),rpc:vi.fn(),from:vi.fn(),checkout:vi.fn(),reconcile:vi.fn(),filters:[] as [string,unknown][],row:null as unknown,queryError:null as unknown}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/api-auth',()=>({requireVerifiedUser:b.owner,requireAdmin:b.admin}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:b.from,rpc:b.rpc})}));
vi.mock('@/lib/resume-writing-stripe',async()=>({...await vi.importActual<typeof import('@/lib/resume-writing-stripe')>('@/lib/resume-writing-stripe'),getResumeWritingStripe:()=>({})}));
vi.mock('@/lib/resume-writing-payment',()=>({verifiedResumeCheckoutUrl:b.checkout,reconcileResumeWritingSession:b.reconcile,resumeWritingPayment:{accountId:'fixture'}}));
import { GET, POST } from '@/app/api/resume-writing/orders/route';
import { POST as checkout } from '@/app/api/resume-writing/orders/[id]/checkout/route';
import { GET as adminGET, POST as adminReconcile } from '@/app/api/admin/resume-writing/route';
import { PATCH as ownerPATCH,GET as ownerGET } from '@/app/api/resume-writing/orders/[id]/route';
import { PATCH } from '@/app/api/admin/resume-writing/[id]/route';
const params={params:Promise.resolve({id:writingId})};
const request=(body:unknown,method='POST',origin='https://joblink.test')=>new Request('https://joblink.test/api/resume-writing/orders',{method,headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});
const valid=()=>({id:writingId,intake:writingIntake,consent:true,termsVersion:writingTerms.version});
beforeEach(()=>{
  vi.stubEnv('RESUME_WRITING_PAYMENT_MODE','live');
  vi.clearAllMocks();b.filters=[];b.row=writingOrder;b.queryError=null;
  for(const [key,value]of Object.entries({RESUME_WRITING_ENABLED:'true',RESUME_WRITING_CHECKOUT_ENABLED:'true',RESUME_WRITING_TERMS_VERSION:writingTerms.version,RESUME_WRITING_DELIVERY_TERMS:writingTerms.delivery,RESUME_WRITING_REVISION_TERMS:writingTerms.revision,RESUME_WRITING_REFUND_TERMS:writingTerms.refund,RESUME_WRITING_PRIVACY_TERMS:writingTerms.privacy}))vi.stubEnv(key,value);
  const role={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'seeker'},error:null})})})})};
  b.owner.mockResolvedValue({user:{id:writingUser},supabase:role});b.admin.mockResolvedValue({user:{id:writingAdmin},supabase:role,isAdmin:true});
  b.rpc.mockImplementation(async(name:string)=>name==='consume_rate_limit'?{data:{allowed:true},error:null}:{data:writingOrder,error:null});
  b.from.mockImplementation(()=>{const q={select:()=>q,eq:(key:string,value:unknown)=>{b.filters.push([key,value]);return q;},neq:()=>q,in:()=>q,not:()=>q,order:()=>q,limit:()=>q,range:()=>q,maybeSingle:async()=>({data:b.row,error:b.queryError}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[],error:b.queryError,count:0}).then(resolve)};return q;});
  b.checkout.mockResolvedValue('https://buy.stripe.com/4gM00igUY0m7eWKdyecV200?client_reference_id=opaque');b.reconcile.mockResolvedValue({outcome:'applied'});
});
afterEach(()=>vi.unstubAllEnvs());
describe('owner/admin order boundaries',()=>{
  it('requires verified authentication for reads, intake and checkout',async()=>{
    b.owner.mockResolvedValue({error:Response.json({error:'Authentication required'},{status:401})});
    expect((await GET()).status).toBe(401);expect((await POST(request(valid()))).status).toBe(401);expect((await checkout(request({}),params)).status).toBe(401);expect(b.from).not.toHaveBeenCalled();
  });
  it('stays disabled by default and does not query missing order tables',async()=>{
    vi.stubEnv('RESUME_WRITING_ENABLED','');expect(await (await GET()).json()).toMatchObject({config:{intakeEnabled:false,checkoutEnabled:false},orders:[]});
    expect((await POST(request(valid()))).status).toBe(503);expect((await checkout(request({}),params)).status).toBe(503);expect(b.from).not.toHaveBeenCalled();expect(b.checkout).not.toHaveBeenCalled();
    expect(await (await adminGET(new Request('https://joblink.test/api/admin/resume-writing'))).json()).toMatchObject({orders:[],unmatched:[],disabled:true});
    expect((await ownerGET(new Request('https://joblink.test/order'),params)).status).toBe(503);
    expect((await ownerPATCH(request({action:'save',version:2,intake:writingIntake},'PATCH'),params)).status).toBe(503);
    expect((await adminReconcile(request({sessionId:'cs_live_Example'}))).status).toBe(503);
    expect((await PATCH(request({version:1,status:'writing'},'PATCH'),params)).status).toBe(503);
    expect(b.from).not.toHaveBeenCalled();expect(b.rpc).not.toHaveBeenCalled();expect(b.reconcile).not.toHaveBeenCalled();
  });
  it('requires configured terms before collecting intake or opening payment',async()=>{
    vi.stubEnv('RESUME_WRITING_DELIVERY_TERMS','');expect((await POST(request(valid()))).status).toBe(503);expect((await checkout(request({}),params)).status).toBe(503);
  });
  it.each([{payment_status:'paid'},{user_id:'someone_else'},{amount:1},{consent:false}])('rejects spoofed/unconsented intake %j',async(extra)=>{
    expect((await POST(request({...valid(),...extra}))).status).toBe(400);expect(b.rpc).not.toHaveBeenCalled();
  });
  it('rejects cross-origin requests and changed terms before a write',async()=>{
    expect((await POST(request(valid(),'POST','https://evil.test'))).status).toBe(400);
    expect((await POST(request({...valid(),termsVersion:'old'}))).status).toBe(409);expect(b.rpc).not.toHaveBeenCalled();
  });
  it('sets ownership and immutable terms on the server and returns no-store responses',async()=>{
    const response=await POST(request(valid()));expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toContain('no-store');
    expect(b.rpc).toHaveBeenCalledWith('create_resume_writing_order',{p_id:writingId,p_user_id:writingUser,p_intake:writingIntake,p_terms:writingTerms,p_payment_policy:resumeWritingPolicy().key});
    await GET();expect(b.filters).toContainEqual(['user_id',writingUser]);expect(b.filters).toContainEqual(['payment_policy',resumeWritingPolicy().key]);
  });
  it('fails closed when the shared rate limiter cannot confirm permission',async()=>{
    b.rpc.mockResolvedValue({data:null,error:{message:'unavailable'}});expect((await POST(request(valid()))).status).toBe(503);expect(b.rpc).toHaveBeenCalledTimes(1);
  });
  it('checks owner filters before creating a checkout URL and refuses other owners',async()=>{
    b.row=null;expect((await checkout(request({}),params)).status).toBe(404);expect(b.checkout).not.toHaveBeenCalled();expect(b.filters).toContainEqual(['user_id',writingUser]);
    b.row={...writingOrder,checkout_reference:writingId};expect((await checkout(request({}),params)).status).toBe(200);expect(b.checkout).toHaveBeenCalledWith({},writingId);
  });
  it('requires admin on lists, reconciliation and fulfillment writes',async()=>{
    b.admin.mockResolvedValue({error:Response.json({error:'Forbidden'},{status:403})});
    expect((await adminGET(new Request('https://joblink.test/api/admin/resume-writing'))).status).toBe(403);
    expect((await adminReconcile(request({sessionId:'cs_live_Example'}))).status).toBe(403);
    expect((await PATCH(request({version:1,status:'writing'},'PATCH'),params)).status).toBe(403);expect(b.reconcile).not.toHaveBeenCalled();
  });
  it('rechecks current Stripe state before a versioned admin transition and stops on failure',async()=>{
    b.row={paid_session_id:'cs_live_Example'};b.reconcile.mockRejectedValueOnce(new Error('unavailable'));
    expect((await PATCH(request({version:1,status:'writing'},'PATCH'),params)).status).toBe(503);expect(b.rpc).not.toHaveBeenCalled();
    expect((await PATCH(request({version:1,status:'writing'},'PATCH'),params)).status).toBe(200);
    expect(b.rpc).toHaveBeenCalledWith('update_resume_writing_fulfillment',{p_id:writingId,p_actor_id:writingAdmin,p_version:1,p_status:'writing',p_delivered:false});
  });
  it('selects sandbox sessions and order filters on the server and rejects client mode overrides',async()=>{
    for(const [key,value]of Object.entries(sandboxEnv))vi.stubEnv(key,value);
    expect((await adminReconcile(request({sessionId:'cs_test_Sandbox'}))).status).toBe(200);
    expect((await adminReconcile(request({sessionId:'cs_live_Example'}))).status).toBe(400);
    expect((await adminReconcile(request({sessionId:'cs_test_Sandbox',mode:'live'}))).status).toBe(400);
    await adminGET(new Request('https://joblink.test/api/admin/resume-writing'));expect(b.filters).toContainEqual(['payment_policy',resumeWritingPolicy().key]);
    b.row={...writingOrder,checkout_reference:writingId};const response=await checkout(request({}),params);expect((await response.json()).mode).toBe('sandbox');
  });
});

describe('resumable owner mutations',()=>{
  it('saves bounded unfinished details, validates only explicit submit, and binds owner/policy/version server-side',async()=>{
    const intake={...writingIntake,email:'a@',role:''};
    expect((await ownerPATCH(request({action:'save',version:2,intake},'PATCH'),params)).status).toBe(200);
    expect(b.rpc).toHaveBeenCalledWith('update_resume_writing_intake',expect.objectContaining({p_user_id:writingUser,p_version:2,p_intake:intake,p_submit:false,p_policy:resumeWritingPolicy().key}));
    expect((await ownerPATCH(request({action:'submit',version:2,intake},'PATCH'),params)).status).toBe(400);
    expect((await ownerPATCH(request({action:'save',version:2,intake,payment_status:'paid'},'PATCH'),params)).status).toBe(400);
  });
  it('serves an old saved order only with owner and policy filters, never a raw object path',async()=>{
    expect((await ownerGET(new Request('https://joblink.test/order'),params)).status).toBe(200);expect(b.filters).toContainEqual(['user_id',writingUser]);expect(b.filters).toContainEqual(['payment_policy',resumeWritingPolicy().key]);
    b.row=null;expect((await ownerGET(new Request('https://joblink.test/order'),params)).status).toBe(404);
  });
  it('requires a note and opaque idempotency ID for revision, and accepts no fulfillment/count override',async()=>{
    const body={action:'revision',version:2,note:'Correct my school project',requestId:writingId};
    expect((await ownerPATCH(request(body,'PATCH'),params)).status).toBe(200);expect(b.rpc).toHaveBeenCalledWith('respond_resume_writing_draft',expect.objectContaining({p_user_id:writingUser,p_action:'revision',p_request_id:writingId}));
    expect((await ownerPATCH(request({...body,revision_count:0},'PATCH'),params)).status).toBe(400);
    expect((await ownerPATCH(request({...body,note:''},'PATCH'),params)).status).toBe(400);
  });
});
