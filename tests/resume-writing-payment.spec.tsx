// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleResumeWritingStripeEvent, inspectResumeWritingSession, reconcileResumeWritingSession, resumeWritingPayment as policy, verifiedResumeCheckoutUrl } from '@/lib/resume-writing-payment';
import { writingAdmin, writingId, writingIntake, writingOther, writingSession, writingTerms, writingUser } from './fixtures/resume-writing';
import { resumeWritingPolicy } from '@/lib/resume-writing-stripe';
import { sandboxEnv } from './fixtures/resume-writing-sandbox';
vi.mock('server-only',()=>({}));
let db:PGlite; let reference:string;
const migration='supabase/migrations/20261017010000_resume_writing_orders.sql';
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.uid',true)::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY,is_admin boolean DEFAULT false,is_banned boolean DEFAULT false);
    GRANT SELECT ON users TO authenticated;
    INSERT INTO users(id,is_admin) VALUES ('${writingUser}',false),('${writingOther}',false),('${writingAdmin}',true);`);
  await db.exec(readFileSync(migration,'utf8'));
},20000);
afterAll(async()=>{await db.close();});
afterEach(()=>vi.unstubAllEnvs());
beforeEach(async()=>{
  vi.stubEnv('RESUME_WRITING_PAYMENT_MODE','live');
  await db.exec('RESET ROLE; TRUNCATE resume_writing_actions,resume_writing_events,resume_writing_receipts,resume_writing_orders CASCADE');
  await createOrder(writingId,writingUser);
  reference=String((await db.query<{checkout_reference:string}>('SELECT checkout_reference FROM resume_writing_orders WHERE id=$1',[writingId])).rows[0].checkout_reference);
});
async function createOrder(id=writingId,user=writingUser,intake=writingIntake) {
  return db.query('SELECT create_resume_writing_order($1,$2,$3,$4,$5)',[id,user,JSON.stringify(intake),JSON.stringify(writingTerms),resumeWritingPolicy().key]);
}
const state=async()=> (await db.query<{payment_status:string;fulfillment_status:string;payment_review_required:boolean;revision_count:number;version:number}>('SELECT payment_status,fulfillment_status,payment_review_required,revision_count,version FROM resume_writing_orders WHERE id=$1',[writingId])).rows[0];
const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  const allowed:Record<string,string[]>={reconcile_resume_writing_payment:['p_event_id','p_event_type','p_session_id','p_reference','p_state','p_payment_intent_id','p_charge_id','p_payment_policy']};
  try{const keys=allowed[name];if(!keys)throw new Error('Unexpected RPC');const result=await db.query<{result:unknown}>(`SELECT ${name}(${keys.map((_,i)=>`$${i+1}`).join(',')}) AS result`,keys.map(k=>args[k]));return {data:result.rows[0].result,error:null};}
  catch{return {data:null,error:{message:'Fixture database rejected operation'}};}
});
const storage={rpc,from:(table:string)=>{
  expect(table).toBe('resume_writing_receipts');let intent='';
  const q={select:()=>q,eq:(_key:string,value:string)=>{intent=value;return q;},maybeSingle:async()=>({data:(await db.query<{session_id:string}>('SELECT session_id FROM resume_writing_receipts WHERE payment_intent_id=$1',[intent])).rows[0]??null,error:null})};return q;
}} as unknown as SupabaseClient;
function provider(session=writingSession(reference)) {
  const retrieve=vi.fn().mockResolvedValue(session);const account=vi.fn().mockResolvedValue({id:policy.accountId});
  const link=vi.fn().mockResolvedValue({active:false,livemode:true,url:policy.paymentLinkUrl,line_items:session.line_items});
  const list=vi.fn().mockResolvedValue({data:[session]});
  return {retrieve,account,link,list,client:{accounts:{retrieve:account},checkout:{sessions:{retrieve,list}},paymentLinks:{retrieve:link}} as unknown as Parameters<typeof inspectResumeWritingSession>[0]};
}
const apply=async(session=writingSession(reference),event='evt_Example')=>reconcileResumeWritingSession(provider(session).client,storage,{id:event,type:'checkout.session.completed'},session.id);
async function status(next:string,delivered=false,actor=writingAdmin,version?:number) {
  const current=await state();return db.query('SELECT update_resume_writing_fulfillment($1,$2,$3,$4,$5)',[writingId,actor,version??current.version,next,delivered]);
}
describe('private order schema and payment reconciliation',()=>{
  it('stores an immutable consented intake with idempotent request creation',async()=>{
    await createOrder();expect((await db.query('SELECT id FROM resume_writing_orders')).rows).toHaveLength(1);
    await expect(createOrder(writingId,writingOther)).rejects.toThrow('request_conflict');
    await expect(createOrder(writingId,writingUser,{...writingIntake,role:'Changed'})).rejects.toThrow('request_conflict');
    expect(await state()).toMatchObject({payment_status:'unpaid',fulfillment_status:'awaiting_payment'});
  });
  it('restricts direct reads to the owner/admin and denies browser writes and RPC execution',async()=>{
    await db.exec(`SET ROLE authenticated; SET test.uid='${writingOther}'`);
    expect((await db.query('SELECT intake FROM resume_writing_orders')).rows).toEqual([]);
    await db.exec(`SET test.uid='${writingUser}'`);expect((await db.query('SELECT intake FROM resume_writing_orders')).rows).toHaveLength(1);
    await expect(db.exec("UPDATE resume_writing_orders SET payment_status='paid'")).rejects.toThrow('permission denied');
    await expect(db.query('SELECT reconcile_resume_writing_payment($1,$2,$3,$4,$5,$6,$7,$8)',['forged','fake','cs_live_fake',reference,'paid','pi_fake','ch_fake',resumeWritingPolicy().key])).rejects.toThrow('permission denied');
    await expect(createOrder()).rejects.toThrow('permission denied');
    await expect(status('writing',false,writingAdmin)).rejects.toThrow('permission denied');
    await expect(db.exec('SELECT * FROM resume_writing_receipts')).rejects.toThrow('permission denied');
    await db.exec(`SET test.uid='${writingAdmin}'`);expect((await db.query('SELECT id FROM resume_writing_orders')).rows).toHaveLength(1);
    await db.exec('RESET ROLE; SET ROLE anon');await expect(db.exec('SELECT * FROM resume_writing_orders')).rejects.toThrow('permission denied');await db.exec('RESET ROLE');
    await db.query('UPDATE users SET is_banned=true WHERE id=$1',[writingUser]);await db.exec(`SET ROLE authenticated; SET test.uid='${writingUser}'`);
    expect((await db.query('SELECT intake FROM resume_writing_orders')).rows).toEqual([]);
    await db.exec('RESET ROLE');await db.query('UPDATE users SET is_banned=false WHERE id=$1',[writingUser]);
  });
  it('retrieves authoritative facts and atomically records the event, receipt and paid order',async()=>{
    const stripe=provider();const result=await reconcileResumeWritingSession(stripe.client,storage,{id:'evt_paid',type:'checkout.session.completed'},writingSession().id);
    expect(result).toMatchObject({outcome:'applied',orderId:writingId,duplicate:false});
    expect(stripe.retrieve).toHaveBeenCalledWith('cs_live_Example',{expand:['line_items.data.price.product','payment_intent.latest_charge']});
    expect(await state()).toMatchObject({payment_status:'paid',fulfillment_status:'ready'});
    expect((await db.query('SELECT session_id FROM resume_writing_receipts')).rows).toHaveLength(1);
  });
  it('handles completed/async/reconciliation/replayed events once without blocking recovery',async()=>{
    const result=await Promise.all([apply(undefined,'evt_a'),apply(undefined,'evt_b'),apply(undefined,'evt_a')]);
    expect(result.some(r=>r.duplicate)).toBe(true);expect((await db.query('SELECT * FROM resume_writing_receipts')).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM resume_writing_events')).rows).toHaveLength(2);
    expect(await state()).toMatchObject({payment_status:'paid',version:1});
  });
  it('queues an unknown reference without assigning intake or granting payment',async()=>{
    const result=await apply(writingSession(writingOther));expect(result.outcome).toBe('unmatched');
    expect((await db.query('SELECT * FROM resume_writing_receipts')).rows).toHaveLength(0);expect((await state()).payment_status).toBe('unpaid');
  });
  it('cannot reassign the same session to another order and rolls its event back on failure',async()=>{
    await apply();await createOrder(writingOther,writingOther);
    const ref=String((await db.query<{checkout_reference:string}>('SELECT checkout_reference FROM resume_writing_orders WHERE id=$1',[writingOther])).rows[0].checkout_reference);
    await expect(apply(writingSession(ref),'evt_reassign')).rejects.toThrow('storage_unavailable');
    expect((await db.query("SELECT * FROM resume_writing_events WHERE event_id='evt_reassign'")).rows).toHaveLength(0);
    expect((await db.query<{order_id:string}>('SELECT order_id FROM resume_writing_receipts')).rows[0].order_id).toBe(writingId);
  });
  it('flags an additional paid session for manual review and never fulfills twice',async()=>{
    await apply();await apply(writingSession(reference,'Second'),'evt_second');
    expect(await state()).toMatchObject({payment_review_required:true,fulfillment_status:'ready'});
    await expect(status('writing')).rejects.toThrow('payment_not_clear');
  });
  it('retains the duplicate hold after a partial refund of the extra receipt and a primary recheck',async()=>{
    await apply(); const extra=writingSession(reference,'Extra');await apply(extra,'evt_extra');
    extra.payment_intent.latest_charge.amount_refunded=100;
    await apply(extra,'evt_partial_extra');await apply(undefined,'evt_recheck_primary');
    expect(await state()).toMatchObject({payment_status:'paid',payment_review_required:true,fulfillment_status:'ready'});
    await expect(status('writing')).rejects.toThrow('payment_not_clear');
  });
  it('preserves completed fulfillment after a duplicate payment and full refund of the extra receipt',async()=>{
    await apply();await status('writing');await status('draft_ready');await status('complete',true);
    const extra=writingSession(reference,'Extra');await apply(extra,'evt_extra');
    expect(await state()).toMatchObject({fulfillment_status:'complete',payment_review_required:true});
    extra.payment_intent.latest_charge.amount_refunded=5000;extra.payment_intent.latest_charge.refunded=true;
    await apply(extra,'evt_full_extra');await apply(undefined,'evt_recheck_primary');
    expect(await state()).toMatchObject({fulfillment_status:'complete',payment_review_required:true});
    await expect(status('writing')).rejects.toThrow('payment_not_clear');
  });
  it.each(['refund','dispute'])('blocks work for a %s and never lets stale success restore it',async(kind)=>{
    await apply();await status('writing');const session=writingSession(reference);
    if(kind==='refund')session.payment_intent.latest_charge.amount_refunded=100;else session.payment_intent.latest_charge.disputed=true;
    await apply(session,`evt_${kind}`);await apply(undefined,'evt_stale_paid');
    expect(await state()).toMatchObject({payment_status:kind==='refund'?'refunded':'disputed',payment_review_required:true,fulfillment_status:'writing'});
    await expect(status('draft_ready')).rejects.toThrow('payment_not_clear');
  });
  it('keeps asynchronous unpaid sessions pending until server-verified success',async()=>{
    const session=writingSession(reference);session.payment_status='unpaid';session.payment_intent.status='processing';
    await apply(session,'evt_processing');expect((await state()).payment_status).toBe('unpaid');
    await apply(undefined,'evt_async_paid');expect((await state()).payment_status).toBe('paid');
  });
  it('records failed/expired checkout without a receipt and does not erase an earlier payment',async()=>{
    const session=writingSession(reference);session.payment_status='unpaid';session.status='open';
    await reconcileResumeWritingSession(provider(session).client,storage,{id:'evt_failed',type:'checkout.session.async_payment_failed'},session.id);
    expect((await db.query<{checkout_status:string}>('SELECT checkout_status FROM resume_writing_orders')).rows[0].checkout_status).toBe('failed');
    await expect(status('writing')).rejects.toThrow('payment_not_clear');
    session.status='expired';
    await apply(session,'evt_expired');expect((await db.query<{checkout_status:string}>('SELECT checkout_status FROM resume_writing_orders')).rows[0].checkout_status).toBe('expired');
    expect((await db.query('SELECT * FROM resume_writing_receipts')).rows).toHaveLength(0);
    await apply(undefined,'evt_paid_after');await apply(session,'evt_old_expired');expect((await state()).payment_status).toBe('paid');
  });
  it('requires an admin, optimistic version, legal steps, one revision, and explicit manual delivery',async()=>{
    await expect(status('writing')).rejects.toThrow('payment_not_clear');await apply();
    await expect(status('writing',false,writingUser)).rejects.toThrow('admin_required');
    await expect(status('writing',false,writingAdmin,0)).rejects.toThrow('version_conflict');
    await status('writing');await status('draft_ready');await status('revision_requested');await status('writing');await status('draft_ready');
    await expect(status('revision_requested')).rejects.toThrow('invalid_transition');await expect(status('complete')).rejects.toThrow('invalid_transition');
    await status('complete',true);expect(await state()).toMatchObject({fulfillment_status:'complete',revision_count:1});
  });
  it.each(['writing','draft_ready','revision_requested'])('preserves %s progress and revision count during a payment hold',async(progress)=>{
    await apply();await status('writing');if(progress!=='writing')await status('draft_ready');if(progress==='revision_requested')await status('revision_requested');
    const before=await state();await apply(writingSession(reference,'Extra'),'evt_extra');
    expect(await state()).toMatchObject({fulfillment_status:progress,revision_count:before.revision_count,payment_review_required:true});
  });
  it('rejects a sandbox receipt for a live-bound order, then reconciles a sandbox-bound order',async()=>{
    for(const [key,value]of Object.entries(sandboxEnv))vi.stubEnv(key,value);
    const p=resumeWritingPolicy();let session=writingSession(reference,'Sandbox',p);
    const stripe=provider(session);stripe.account.mockResolvedValue({id:p.accountId});
    await expect(reconcileResumeWritingSession(stripe.client,storage,{id:'evt_cross_policy',type:'checkout.session.completed'},session.id)).rejects.toThrow('storage_unavailable');
    expect((await state()).payment_status).toBe('unpaid');expect((await db.query('SELECT * FROM resume_writing_events')).rows).toHaveLength(0);
    await db.exec('TRUNCATE resume_writing_actions,resume_writing_events,resume_writing_receipts,resume_writing_orders CASCADE');await createOrder();
    reference=String((await db.query<{checkout_reference:string}>('SELECT checkout_reference FROM resume_writing_orders')).rows[0].checkout_reference);
    session=writingSession(reference,'Sandbox',p);stripe.retrieve.mockResolvedValue(session);
    await reconcileResumeWritingSession(stripe.client,storage,{id:'evt_sandbox_paid',type:'checkout.session.completed'},session.id);
    expect(await state()).toMatchObject({payment_status:'paid',fulfillment_status:'ready'});
    stripe.link.mockResolvedValue({active:true,livemode:false,url:p.paymentLinkUrl,line_items:session.line_items});
    expect(await verifiedResumeCheckoutUrl(stripe.client,reference)).toBe(`${p.paymentLinkUrl}?client_reference_id=${reference}`);
  });
});
describe('Stripe validation and routing',()=>{
  const invalid:[string,(s:ReturnType<typeof writingSession>)=>void][]=[
    ['wrong currency',s=>{s.currency='usd';}],['wrong amount',s=>{s.amount_total=1;}],['wrong price',s=>{s.line_items.data[0].price.id='price_wrong';}],
    ['wrong product',s=>{s.line_items.data[0].price.product='prod_wrong';}],['wrong link',s=>{s.payment_link='plink_wrong';}],
    ['test mode',s=>{s.livemode=false;}],['subscription',s=>{s.mode='subscription';}],['extra items',s=>{s.line_items.data.push(s.line_items.data[0]);}],
    ['extra quantity',s=>{s.line_items.data[0].quantity=2;}],['missing items',s=>{s.line_items.has_more=true;}],
    ['discount',s=>{s.total_details.amount_discount=100;}],['extra tax',s=>{s.total_details.amount_tax=100;}],
    ['uncaptured charge',s=>{s.payment_intent.latest_charge.captured=false;}],['processing paid claim',s=>{s.payment_intent.status='processing';}],
  ];
  it.each(invalid)('rejects %s without recording paid state',async(_name,mutate)=>{const session=writingSession(reference);mutate(session);await expect(apply(session)).rejects.toThrow('unverified_payment');expect((await state()).payment_status).toBe('unpaid');});
  it('rejects wrong merchant/provider failures without leaking details',async()=>{const stripe=provider();stripe.account.mockResolvedValueOnce({id:'acct_wrong'});await expect(inspectResumeWritingSession(stripe.client,'cs_live_Example')).rejects.toThrow('unverified_payment');stripe.retrieve.mockRejectedValueOnce(new Error('Private detail'));await expect(inspectResumeWritingSession(stripe.client,'cs_live_Example')).rejects.toThrow('provider_unavailable');});
  it('refuses the inactive link; an active verified link contains only the opaque reference',async()=>{const stripe=provider();await expect(verifiedResumeCheckoutUrl(stripe.client,reference)).rejects.toThrow('checkout_unavailable');stripe.link.mockResolvedValueOnce({active:true,livemode:true,url:policy.paymentLinkUrl,line_items:writingSession().line_items});const url=new URL(await verifiedResumeCheckoutUrl(stripe.client,reference));expect([...url.searchParams.entries()]).toEqual([['client_reference_id',reference]]);});
  it('routes its signed checkout ahead of legacy handling and acknowledges replay only after the transaction',async()=>{vi.stubEnv('RESUME_WRITING_ENABLED','true');const session=writingSession(reference);const event={id:'evt_hook',type:'checkout.session.completed',data:{object:session}} as unknown as Stripe.Event;expect(await handleResumeWritingStripeEvent(provider(session).client,storage,event)).toBe(true);expect((await state()).payment_status).toBe('paid');vi.unstubAllEnvs();});
  it('reconciles a refund that arrived before the completed event without granting work',async()=>{vi.stubEnv('RESUME_WRITING_ENABLED','true');const session=writingSession(reference);session.payment_intent.latest_charge.amount_refunded=5000;const stripe=provider(session);const event={id:'evt_early_refund',type:'charge.refunded',livemode:true,data:{object:{payment_intent:session.payment_intent.id}}} as unknown as Stripe.Event;expect(await handleResumeWritingStripeEvent(stripe.client,storage,event)).toBe(true);expect(stripe.list).toHaveBeenCalled();expect(await state()).toMatchObject({payment_status:'refunded',payment_review_required:true,fulfillment_status:'awaiting_payment'});});
});
