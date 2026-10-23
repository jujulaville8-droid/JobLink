'use client';
import { useEffect,useId,useRef,useState } from 'react';
import styles from './studio.module.css';
import { resumeIntakeSchema,writingStatusLabels,type ResumeWritingIntake,type ResumeWritingOrder,type WritingConfig } from '@/lib/resume-writing';
import { getApplicationReturnTo,getResumeWritingReturnTo } from '@/lib/return-to';
import { approvedWritingTerms,writingRevisionAvailable } from '@/lib/resume-writing-terms';

const fields=[
  {key:'name',label:'Name for your résumé',max:120}, {key:'email',label:'Delivery email',max:254},
  {key:'role',label:'Type of job you want',max:150}, {key:'education',label:'Education and training (optional)',max:1500},
  {key:'skills',label:'Skills and strengths (optional)',max:1500}, {key:'experience',label:'Experience and responsibilities (optional)',max:2000},
] as const;
const empty:ResumeWritingIntake={name:'',email:'',role:'',education:'',skills:'',experience:'',experienceType:''};
type OfferData={config:WritingConfig;orders:ResumeWritingOrder[]};
const disabled:WritingConfig={intakeEnabled:false,checkoutEnabled:false,terms:null};
export default function LegacyResumeWritingRequest({initialData,initialConfig,initialOrderId,applicationReturnTo}:{initialData?:OfferData;initialConfig?:WritingConfig;initialOrderId?:string;applicationReturnTo?:string|null}) {
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),first=useRef<HTMLInputElement>(null),revisionId=useRef('');
  const [open,setOpen]=useState(true),[reviewing,setReviewing]=useState(false),[draft,setDraft]=useState(empty);
  const [data,setData]=useState<OfferData>(initialData??{config:initialConfig??disabled,orders:[]});
  const [loaded,setLoaded]=useState(!!initialData),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[needsAuth,setNeedsAuth]=useState(false);
  const [order,setOrder]=useState<ResumeWritingOrder|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState('');
  const application=getApplicationReturnTo(applicationReturnTo);const query=new URLSearchParams();query.set('requests','1');if(order?.id||initialOrderId)query.set('order',order?.id??initialOrderId!);if(application)query.set('application',application);
  const returnTo=getResumeWritingReturnTo(`/resume-writing${query.size?`?${query}`:''}`)!;const loginHref=`/login?returnTo=${encodeURIComponent(returnTo)}`;
  function choose(saved:ResumeWritingOrder){revisionId.current='';setRevision('');setOrder(saved);setDraft(saved.intake);setReviewing(saved.intake_status==='complete');setConsent(true);setError('');setNotice('');}
  useEffect(()=>{if(open&&!reviewing&&!needsAuth)first.current?.focus();},[open,reviewing,needsAuth]);
  useEffect(()=>{
    if(!open||loaded)return;let cancelled=false;
    void(async()=>{try{
      const response=await fetch('/api/resume-writing/orders',{cache:'no-store'});const body=await response.json();
      if(response.status===401 || (response.status===403&&body.code==='EMAIL_UNVERIFIED')){
        const config=await fetch('/api/resume-writing/config',{cache:'no-store'}).then(r=>r.json());
        if(!cancelled){setNeedsAuth(true);if(config.config)setData({config:config.config,orders:[]});}return;
      }
      if(!response.ok||!body.config||!Array.isArray(body.orders))throw new Error();
      let selected=body.orders.find((o:ResumeWritingOrder)=>o.id===initialOrderId);
      if(!selected&&initialOrderId&&getResumeWritingReturnTo(`/resume-writing?order=${initialOrderId}`)?.includes('order=')){
        const response=await fetch(`/api/resume-writing/orders/${initialOrderId}`,{cache:'no-store'});if(response.ok)selected=(await response.json()).order;
      }
      if(!cancelled){setData(body);if(selected)choose(selected);}
    }catch{if(!cancelled)setError('Could not load saved requests. Your draft is still on this page.');}finally{if(!cancelled)setLoaded(true);}})();
    return()=>{cancelled=true;};
  },[open,loaded,initialOrderId]);
  function saved(next:ResumeWritingOrder){setOrder(next);setData(current=>({...current,orders:[next,...current.orders.filter(o=>o.id!==next.id)]}));}
  async function save(action:'save'|'submit'){
    if(!order||busy||!consent||!data.config.intakeEnabled||!data.config.terms)return;
    if(action==='submit'&&!resumeIntakeSchema.safeParse(draft).success){setError('Add your name, valid delivery email, target job, and experience choice. Paid experience is not required.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch(`/api/resume-writing/orders/${order.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,version:order.version,intake:draft})});const body=await response.json();if(!response.ok||!body.order)throw new Error(body.error||'Changes were not confirmed.');saved(body.order);
      setNotice(action==='submit'?'Questionnaire submitted.':'Progress saved. You can return to finish your questionnaire.');if(action==='submit')setReviewing(true);
    }catch(failure){setError(failure instanceof Error?failure.message:'Could not save. Your changes are still on this page.');}finally{setBusy(false);}
  }
  async function refresh(){
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/resume-writing/orders',{cache:'no-store'});const body=await response.json();
      if(!response.ok||!body.config||!Array.isArray(body.orders))throw new Error();
      let next=order?body.orders.find((o:ResumeWritingOrder)=>o.id===order.id):null;
      if(order&&!next){
        const selected=await fetch(`/api/resume-writing/orders/${order.id}`,{cache:'no-store'});const detail=await selected.json();
        if(!selected.ok||detail.order?.id!==order.id)throw new Error();
        next=detail.order;
      }
      setData(body);if(next)setOrder(next);setNotice('Saved status refreshed.');
    }catch{setError('Could not refresh saved status.');}finally{setBusy(false);}
  }
  async function respond(action:'approve'|'revision'){if(!order||busy)return;revisionId.current||=crypto.randomUUID();setBusy(true);setError('');try{const response=await fetch(`/api/resume-writing/orders/${order.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,version:order.version,...(action==='revision'?{requestId:revisionId.current,note:revision}:{})})});const body=await response.json();if(!response.ok||!body.order)throw new Error(body.error||'Response was not confirmed.');saved(action==='approve'&&body.order.id===order.id&&body.order.revision_count===order.revision_count?{...body.order,files:body.order.files??order.files}:body.order);setNotice(action==='revision'?'Revision requested. Your original details remain unchanged.':'Thank you. Your résumé is marked complete.');}catch(failure){setError(failure instanceof Error?failure.message:'Could not confirm your response.');}finally{setBusy(false);}}
  const terms=order?.terms??data.config.terms??approvedWritingTerms;const editable=!!order&&order.intake_status==='draft';const clear=order?.payment_status==='paid'&&!order.payment_review_required;
  return <aside className={styles.purchase} aria-label="Optional résumé writing service">
    <h2>Your existing résumé request</h2>
    <button ref={trigger} type="button" className={styles.secondary} aria-expanded={open} aria-controls={`${id}-intake`} onClick={()=>setOpen(!open)}>{open?'Hide saved request':'View saved request'}</button>
    <div id={`${id}-intake`} className={styles.purchasePanel} hidden={!open}>
      {needsAuth?<p><a className={styles.primary} href={loginHref}>Sign in to view your saved request</a> <a href={`/signup?role=seeker&returnTo=${encodeURIComponent(returnTo)}`}>Create a free account</a>. Verify your email to access your saved request.</p>:<>
        {data.orders.length>0&&<section aria-label="Saved résumé requests"><h3>Your recent saved requests</h3>{data.orders.map(o=><button key={o.id} type="button" className={styles.secondary} disabled={busy} onClick={()=>choose(o)}>{o.intake.role||'Unfinished questionnaire'} · {writingStatusLabels[o.fulfillment_status]}</button>)}</section>}
        {order ? <><h3>{editable?'Your starting point':'Your saved questionnaire'}</h3><p>School projects, volunteering, caregiving and informal responsibilities are welcome. Share only true details; we will not invent experience.</p>
        <p id={`${id}-privacy`}>Save progress to resume on another visit. Unsaved changes stay on this page and are lost if you leave or reload. Do not include ID numbers, card details, or private information about other people.</p>
        {editable&&!reviewing?<form aria-label="Résumé writing intake" onSubmit={event=>{event.preventDefault();setError('');setReviewing(true);}}>
          <div className={styles.purchaseFields}>{fields.map(field=><label key={field.key} className={styles.field}><span>{field.label}</span>{['education','skills','experience'].includes(field.key)?<textarea rows={3} maxLength={field.max} value={draft[field.key]} aria-describedby={`${id}-privacy`} onChange={e=>setDraft({...draft,[field.key]:e.target.value})}/>:<input ref={field.key==='name'?first:undefined} type={field.key==='email'?'email':'text'} maxLength={field.max} autoComplete="off" value={draft[field.key]} onChange={e=>setDraft({...draft,[field.key]:e.target.value})}/>}</label>)}
            <label className={styles.field}><span>Which best describes your experience?</span><select value={draft.experienceType} onChange={e=>setDraft({...draft,experienceType:e.target.value as ResumeWritingIntake['experienceType']})}><option value="">Choose when ready</option><option value="none">No work history yet</option><option value="informal">Informal work, projects, volunteering or caregiving</option><option value="paid">Paid work</option><option value="mixed">A mix of paid and informal experience</option></select></label>
          </div><button className={styles.secondary} type="submit">Review your details</button>
        </form>:<dl className={styles.purchaseReview}>{fields.map(field=><div key={field.key}><dt>{field.label}</dt><dd>{draft[field.key]||'Not added'}</dd></div>)}<div><dt>Experience choice</dt><dd>{draft.experienceType||'Not chosen'}</dd></div></dl>}
        <section aria-label="Service terms">{terms?Object.entries(terms).map(([key,value])=>key==='version'?null:<p key={key}><strong>{key[0].toUpperCase()+key.slice(1)}: </strong>{value}</p>):<p>Delivery cutoffs and weekends, revision window, refund and retention terms are awaiting confirmation.</p>}</section>
        {order&&<section aria-label="Your request status"><h3>{writingStatusLabels[order.fulfillment_status]}</h3><p>Payment: {order.payment_status} · Questionnaire: {order.intake_status==='complete'?'Submitted':'In progress'} · Revision: {order.revision_count}/1 used</p>{order.first_draft_due_at&&<p>First draft due: <time dateTime={order.first_draft_due_at}>{order.first_draft_due_at}</time> (UTC)</p>}{order.revision_expires_at&&<p>Revision request deadline: <time dateTime={order.revision_expires_at}>{order.revision_expires_at}</time> (UTC)</p>}{order.payment_review_required&&<p>Payment needs review before work or downloads can continue. Your progress is preserved.</p>}</section>}
        <div className={styles.purchaseActions}>
          {editable&&<><button type="button" className={styles.secondary} disabled={busy||!consent||!data.config.intakeEnabled} onClick={()=>void save('save')}>Save progress</button><button type="button" className={styles.primary} disabled={busy||!consent||!data.config.intakeEnabled} onClick={()=>void save('submit')}>Submit questionnaire</button>{reviewing&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>setReviewing(false)}>Edit your details</button>}</>}
          {order&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>void refresh()}>Refresh saved status</button>}
          {order&&<a href={returnTo} target="_blank" rel="noopener noreferrer">Return to this saved request (new tab)</a>}
        </div>
        {order&&clear&&(order.files??[]).filter(f=>f.published_at&&f.revision_number===order.revision_count).map(file=><p key={file.id}><a href={`/api/resume-writing/orders/${order.id}/files/${file.id}`} target="_blank" rel="noopener noreferrer">Download {file.kind==='pdf'?'PDF':'editable DOCX'}</a></p>)}
        {order&&clear&&['draft_ready','complete'].includes(order.fulfillment_status)&&<section aria-label="Respond to your draft">{order.fulfillment_status==='draft_ready'&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>void respond('approve')}>Approve résumé</button>}{writingRevisionAvailable(order)?<><label className={styles.field}><span>What would you like changed? One revision is included.</span><textarea maxLength={2000} value={revision} onChange={e=>setRevision(e.target.value)}/></label><button type="button" className={styles.secondary} disabled={busy||!revision.trim()} onClick={()=>void respond('revision')}>Request included revision</button></>:order.revision_count===0&&<p>The 7-day revision request window has ended or its delivery date could not be confirmed. Contact JobLink if you need help.</p>}</section>}
        </> : loaded && <p>Select an existing request above. No new orders are being accepted here.</p>}
        <div className={styles.purchaseActions}><button type="button" className={styles.secondary} onClick={()=>{setOpen(false);trigger.current?.focus();}}>Keep using the free builder</button>{application&&<a href={application}>Return to your application</a>}</div>
      </>}
      {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
    </div>
  </aside>;
}
