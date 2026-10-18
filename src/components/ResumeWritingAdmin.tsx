'use client';
import { useEffect,useRef,useState } from 'react';
import { writingStatusLabels,type ResumeWritingOrder,type WritingFile } from '@/lib/resume-writing';

type Count={day:string;event:string;count:number};
export default function ResumeWritingAdmin(){
  const [orders,setOrders]=useState<ResumeWritingOrder[]>([]),[unmatched,setUnmatched]=useState<{event_id:string;session_id:string}[]>([]),[counts,setCounts]=useState<Count[]>([]);
  const [page,setPage]=useState(1),[hasNext,setHasNext]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[disabled,setDisabled]=useState(true),[session,setSession]=useState(''),[reload,setReload]=useState(0),[mode,setMode]=useState('');
  useEffect(()=>{let cancelled=false;void(async()=>{try{const response=await fetch(`/api/admin/resume-writing?page=${page}`,{cache:'no-store'}),body=await response.json();if(!response.ok)throw new Error();if(!cancelled){setOrders(body.orders);setUnmatched(body.unmatched);setCounts(body.counts??[]);setHasNext(!!body.hasNext);setDisabled(!!body.disabled);setMode(body.paymentMode??'');}}catch{if(!cancelled)setError('Could not load paid requests.');}})();return()=>{cancelled=true;};},[page,reload]);
  async function mutate(url:string,body:unknown,method='POST'){
    setBusy(true);setError('');try{const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json();if(!response.ok)throw new Error(result.error||'Update not confirmed.');setReload(n=>n+1);}catch(failure){setError(failure instanceof Error?failure.message:'Could not update request.');}finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-4xl space-y-6"><h1 className="text-3xl font-semibold">Résumé writing orders</h1>
    <p>Prepare each résumé from the customer’s true details. Upload a PDF and editable DOCX, download both to check them, then confirm human review before publishing. The customer receives private downloads on their saved request page.</p>
    {mode==='sandbox'&&<p role="status">Sandbox test orders · synthetic details only.</p>}{disabled&&<p role="status">Résumé writing is disabled. Approve the service terms and configuration before enabling it.</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}
    {!disabled&&<form className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();void mutate('/api/admin/resume-writing',{sessionId:session});}}><label>Stripe Checkout Session ID<input className="block rounded border p-2" required value={session} onChange={e=>setSession(e.target.value)}/></label><button className="rounded border px-4 py-2" disabled={busy}>Reconcile payment</button></form>}
    {unmatched.length>0&&<section aria-label="Unmatched payments"><h2 className="font-semibold">Unmatched payments need review</h2><p>Do not assign payment by email or mark an unmatched payment fulfilled.</p>{unmatched.map(e=><p className="break-all" key={e.event_id}>{e.session_id} · {e.event_id}</p>)}</section>}
    {counts.length>0&&<details><summary>Private service funnel counts</summary><p>Daily transition counts, not unique visitors. No applicant details or identifiers are recorded in these counts.</p><table className="w-full text-left"><thead><tr><th>Day</th><th>Step</th><th>Count</th></tr></thead><tbody>{counts.map(c=><tr key={`${c.day}:${c.event}`}><td>{c.day}</td><td>{c.event.replaceAll('_',' ')}</td><td>{c.count}</td></tr>)}</tbody></table></details>}
    {!orders.length&&!disabled&&<p>No paid requests on this page.</p>}
    {orders.map(order=><article key={`${order.id}:${order.version}`} className="space-y-3 rounded-xl border bg-white p-5 text-slate-800"><h2 className="text-xl font-semibold">{order.intake.name||'Questionnaire in progress'} · {order.intake.role||'Target job not added'}</h2><p>{writingStatusLabels[order.fulfillment_status]} · Payment: {order.payment_status} · Questionnaire: {order.intake_status} · Revision: {order.revision_count}/1</p>{order.payment_review_required&&<p>Payment hold: explicit resolution is required. Fulfillment progress is preserved.</p>}<p className="break-all">Request {order.id}</p>
      <dl>{Object.entries(order.intake).map(([key,value])=><div key={key} className="my-2"><dt className="text-sm font-semibold">{key}</dt><dd className="whitespace-pre-wrap break-words">{value||'Not added'}</dd></div>)}</dl>
      {order.revision_note&&<p className="whitespace-pre-wrap break-words"><strong>Customer revision request: </strong>{order.revision_note}</p>}<details><summary>Agreed service terms</summary>{Object.entries(order.terms).map(([key,value])=><p key={key}><strong>{key}: </strong>{value}</p>)}</details>
      {order.payment_status==='paid'&&!order.payment_review_required&&order.intake_status==='complete'?<>
        {['ready','revision_requested'].includes(order.fulfillment_status)&&<button className="rounded border px-4 py-2" disabled={busy} onClick={()=>void mutate(`/api/admin/resume-writing/${order.id}`,{version:order.version,status:'writing'},'PATCH')}>Verify payment and start writing</button>}
        {order.fulfillment_status==='writing'&&<DocumentReview order={order} busy={busy} refresh={()=>setReload(n=>n+1)} publish={body=>mutate(`/api/admin/resume-writing/${order.id}`,body,'PATCH')}/>}
        {['draft_ready','complete'].includes(order.fulfillment_status)&&<p>The customer can download their published documents and respond from their saved request page.</p>}
      </>:<p>Work is unavailable until payment is clear and the questionnaire is submitted.</p>}
    </article>)}
    <nav aria-label="Order pages" className="flex gap-4"><button disabled={page===1||busy} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button disabled={!hasNext||busy} onClick={()=>setPage(p=>p+1)}>Next</button></nav>
  </div>;
}
function DocumentReview({order,busy,refresh,publish}:{order:ResumeWritingOrder;busy:boolean;refresh:()=>void;publish:(body:unknown)=>Promise<void>}){
  const files=(order.files??[]).filter(f=>f.revision_number===order.revision_count&&!f.published_at);
  const [pdf,setPdf]=useState(files.find(f=>f.kind==='pdf')?.id??''),[editable,setEditable]=useState(files.find(f=>f.kind==='editable')?.id??''),[reviewed,setReviewed]=useState(false);
  return <section className="space-y-4" aria-label="Human document review"><h3 className="font-semibold">Prepare and review documents</h3><p>PDF and DOCX only, up to 5 MB each. Files stay private until this pair is published. Never invent experience or qualifications.</p>
    <Upload order={order} kind="pdf" refresh={refresh}/><Upload order={order} kind="editable" refresh={refresh}/>
    <FileChoice label="Reviewed PDF" files={files.filter(f=>f.kind==='pdf')} value={pdf} choose={value=>{setPdf(value);setReviewed(false);}} orderId={order.id}/>
    <FileChoice label="Reviewed editable DOCX" files={files.filter(f=>f.kind==='editable')} value={editable} choose={value=>{setEditable(value);setReviewed(false);}} orderId={order.id}/>
    <label className="flex gap-2"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><span>I opened both selected files, checked them against the submitted questionnaire and revision request, and approve this pair for the customer.</span></label>
    <button className="rounded border px-4 py-2" disabled={busy||!reviewed||!pdf||!editable} onClick={()=>void publish({version:order.version,status:'draft_ready',reviewed:true,pdfId:pdf,editableId:editable})}>Verify payment and publish reviewed pair</button>
  </section>;
}
function FileChoice({label,files,value,choose,orderId}:{label:string;files:WritingFile[];value:string;choose:(id:string)=>void;orderId:string}){
  return <div><label>{label}<select className="ml-2 max-w-full rounded border p-2" value={value} onChange={e=>choose(e.target.value)}><option value="">Choose an uploaded file</option>{files.map((file,i)=><option key={file.id} value={file.id}>Upload {i+1} · {file.id.slice(0,8)}</option>)}</select></label>{value&&<a className="ml-3 underline" href={`/api/resume-writing/orders/${orderId}/files/${value}?review=true`} target="_blank" rel="noopener noreferrer">Download to review</a>}</div>;
}
function Upload({order,kind,refresh}:{order:ResumeWritingOrder;kind:'pdf'|'editable';refresh:()=>void}){
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const uploadId=useRef('');
  async function upload(){if(!file||busy)return;uploadId.current||=crypto.randomUUID();setBusy(true);setError('');try{const body=new FormData();body.set('id',uploadId.current);body.set('version',String(order.version));body.set('kind',kind);body.set('file',file);const response=await fetch(`/api/admin/resume-writing/${order.id}/files`,{method:'POST',body});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload not confirmed.');refresh();}catch(failure){setError(failure instanceof Error?failure.message:'Upload unavailable.');}finally{setBusy(false);}}
  return <div><label>Upload {kind==='pdf'?'PDF':'editable DOCX'}<input className="block max-w-full" type="file" accept={kind==='pdf'?'.pdf':'.docx'} disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);uploadId.current='';}}/></label><button className="rounded border px-3 py-1" disabled={busy||!file} onClick={()=>void upload()}>Save private {kind==='pdf'?'PDF':'DOCX'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
