'use client';
import { useEffect, useState } from 'react';
import { writingStatusLabels, type ResumeWritingOrder } from '@/lib/resume-writing';

export default function ResumeWritingAdmin() {
  const [orders,setOrders]=useState<ResumeWritingOrder[]>([]); const [unmatched,setUnmatched]=useState<{event_id:string;session_id:string}[]>([]);
  const [page,setPage]=useState(1); const [hasNext,setHasNext]=useState(false); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const [disabled,setDisabled]=useState(true);
  const [session,setSession]=useState(''); const [reload,setReload]=useState(0);
  const [paymentMode,setPaymentMode]=useState('');
  useEffect(()=>{
    let cancelled=false;
    void (async()=>{try{const response=await fetch(`/api/admin/resume-writing?page=${page}`,{cache:'no-store'});const body=await response.json();
      if(!response.ok)throw new Error(body.error);if(!cancelled){setOrders(body.orders);setUnmatched(body.unmatched);setHasNext(!!body.hasNext);setDisabled(!!body.disabled);setPaymentMode(body.paymentMode??'');}
    }catch{if(!cancelled)setError('Could not load paid requests.');}})();return()=>{cancelled=true;};
  },[page,reload]);
  async function mutate(url:string,body:unknown,method='POST') {
    setBusy(true);setError('');
    try{const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Payment could not be matched to a saved request.');setReload(n=>n+1);
    }catch(failure){setError(failure instanceof Error?failure.message:'Could not update request.');}finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-4xl space-y-6">
    <h1 className="text-3xl font-semibold">Résumé writing orders</h1>
    <p>Paid requests only. Verify payment before work. Drafts and final documents are delivered manually through the agreed channel; this page does not send messages or files.</p>
    {paymentMode==='sandbox'&&<p role="status">Sandbox test orders · no real payments.</p>}
    {disabled&&<p role="status">Résumé writing is disabled. Configure and approve the service before enabling it.</p>}
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {!disabled&&<form onSubmit={e=>{e.preventDefault();void mutate('/api/admin/resume-writing',{sessionId:session});}} className="flex flex-wrap gap-3">
      <label>Stripe Checkout Session ID<input className="block rounded border p-2" required value={session} onChange={e=>setSession(e.target.value)} /></label>
      <button disabled={busy} className="rounded border px-4 py-2">Reconcile payment</button>
    </form>}
    {unmatched.length>0&&<section aria-label="Unmatched payments"><h2 className="font-semibold">Unmatched payments need review</h2><p>These events have no matching private request. Do not assign payment by email or mark them fulfilled.</p>{unmatched.map(e=><p key={e.event_id} className="break-all">{e.session_id} · {e.event_id}</p>)}</section>}
    {!orders.length&&!disabled&&<p>No paid requests on this page.</p>}
    {orders.map(order=><article key={`${order.id}:${order.version}`} className="space-y-3 rounded-xl border bg-white p-5 text-slate-800">
      <h2 className="text-xl font-semibold">{order.intake.name} · {order.intake.role}</h2>
      <p>{writingStatusLabels[order.fulfillment_status]} · Payment: {order.payment_status} · Revision used: {order.revision_count}/1</p>
      {order.payment_review_required&&<p>Payment hold: explicit resolution is required. Fulfillment progress is preserved.</p>}
      <p className="break-all">Request {order.id}</p>
      <dl>{Object.entries(order.intake).map(([key,value])=><div key={key} className="my-2"><dt className="text-sm font-semibold">{key}</dt><dd className="whitespace-pre-wrap break-words">{value||'Not added'}</dd></div>)}</dl>
      <details><summary>Agreed service terms</summary>{Object.entries(order.terms).map(([key,value])=><p key={key}><strong>{key}: </strong>{value}</p>)}</details>
      <FulfillmentForm order={order} busy={busy} update={(status,delivered)=>mutate(`/api/admin/resume-writing/${order.id}`,{version:order.version,status,delivered},'PATCH')} />
    </article>)}
    <nav aria-label="Order pages" className="flex gap-4"><button disabled={page===1||busy} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button disabled={!hasNext||busy} onClick={()=>setPage(p=>p+1)}>Next</button></nav>
  </div>;
}
function FulfillmentForm({order,busy,update}:{order:ResumeWritingOrder;busy:boolean;update:(status:string,delivered:boolean)=>Promise<void>}) {
  const transitions:Record<string,string[]>={ready:['writing'],writing:['draft_ready'],revision_requested:['writing'],draft_ready:order.revision_count===0?['complete','revision_requested']:['complete']};
  const choices=transitions[order.fulfillment_status]??[]; const [status,setStatus]=useState(choices[0]??'');const [delivered,setDelivered]=useState(false);
  if(!choices.length||order.payment_status!=='paid'||order.payment_review_required)return <p>Work is unavailable until payment is clear and the request permits another step.</p>;
  return <form onSubmit={e=>{e.preventDefault();void update(status,delivered);}} className="flex flex-wrap items-center gap-3">
    <label>Next status<select className="ml-2 rounded border p-2" value={status} onChange={e=>setStatus(e.target.value)}>{choices.map(s=><option key={s} value={s}>{writingStatusLabels[s as keyof typeof writingStatusLabels]}</option>)}</select></label>
    {status==='complete'&&<label><input type="checkbox" checked={delivered} onChange={e=>setDelivered(e.target.checked)} /> I delivered the final PDF and editable copy manually.</label>}
    <button className="rounded border px-4 py-2" disabled={busy||(status==='complete'&&!delivered)}>Verify payment and update</button>
  </form>;
}
