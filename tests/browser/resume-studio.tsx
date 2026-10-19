// Test-only entry, served by Vite. Not a Next.js route or production auth bypass.
import { createRoot } from 'react-dom/client';
import ResumeStudio from '../../src/components/cv/studio/ResumeStudio';
import { resumeFixture } from '../fixtures/resume';
import { browserWritingOrder, browserWritingTerms } from './resume-writing-fixture';

const stored = structuredClone(resumeFixture);
const purchaseEnabled = new URLSearchParams(location.search).get('purchase') === 'enabled';
let savedOrder: typeof browserWritingOrder | null = null;
let verifiedPaid = false;
if(new URLSearchParams(location.search).get('stage')==='draft'){
  savedOrder={...browserWritingOrder,intake_status:'complete',payment_status:'paid',checkout_status:'paid',fulfillment_status:'draft_ready',files:[{id:'40000000-0000-4000-8000-000000000001',kind:'pdf',revision_number:0,published_at:'2026-10-18'},{id:'40000000-0000-4000-8000-000000000002',kind:'editable',revision_number:0,published_at:'2026-10-18'}]};
  verifiedPaid=true;
}
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (String(input) === '/api/resume-writing/orders') {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      savedOrder = { ...browserWritingOrder, id: body.id, intake: body.intake };
      return Response.json({ order: savedOrder }, { status: 201 });
    }
    if (savedOrder && verifiedPaid && savedOrder.payment_status!=='paid') savedOrder = { ...savedOrder, payment_status:'paid', checkout_status:'paid', fulfillment_status:savedOrder.intake_status==='complete'?'ready':'awaiting_intake', version:savedOrder.version+1 };
    return Response.json({ config: { intakeEnabled:purchaseEnabled, checkoutEnabled:purchaseEnabled, terms:purchaseEnabled?browserWritingTerms:null, paymentMode:purchaseEnabled?'sandbox':null }, orders:savedOrder?[savedOrder]:[] });
  }
  if (/^\/api\/resume-writing\/orders\/[^/]+$/.test(String(input)) && init?.method==='PATCH' && savedOrder) {
    const body=JSON.parse(String(init.body));
    savedOrder={...savedOrder,intake:body.intake??savedOrder.intake,intake_status:body.action==='submit'?'complete':savedOrder.intake_status,
      fulfillment_status:body.action==='revision'?'revision_requested':body.action==='approve'?'complete':verifiedPaid&&body.action==='submit'?'ready':savedOrder.fulfillment_status,
      revision_count:body.action==='revision'?1:savedOrder.revision_count,version:savedOrder.version+1};
    return Response.json({order:savedOrder});
  }
  if (/^\/api\/resume-writing\/orders\/[^/]+\/checkout$/.test(String(input))) {
    return Response.json({mode:'sandbox',url:'https://buy.stripe.com/test_SyntheticSandbox?client_reference_id=30000000-0000-4000-8000-000000000001'});
  }
  if (String(input) !== '/api/cv/studio') return nativeFetch(input, init);
  if (!init?.method) return Response.json(stored);
  const body = JSON.parse(String(init.body));
  if (body.section === 'profile') { Object.assign(stored.profile, body.entry); return Response.json({ entry: stored.profile }); }
  const rows = stored[body.section as keyof typeof stored];
  if (!Array.isArray(rows)) return Response.json({ error: 'Unknown section' }, { status: 400 });
  if (init.method === 'DELETE') return Response.json({ success: true });
  const entry = { ...body.entry, id: body.id, cv_profile_id: stored.profile.id, sort_order: body.sort_order };
  return Response.json({ entry });
};
createRoot(document.getElementById('root')!).render(<>
  <p style={{margin:0,padding:12,background:'#fff4ce',color:'#312b18'}}>SYNTHETIC LOCAL FIXTURE · No payment or live intake · {purchaseEnabled?'Enabled flow simulation':'Default checkout disabled'}</p>
  {purchaseEnabled&&<button type="button" onClick={()=>{verifiedPaid=true;}}>Simulate verified payment (fixture only)</button>}
  {purchaseEnabled&&<button type="button" onClick={()=>{if(savedOrder)savedOrder={...savedOrder,fulfillment_status:'draft_ready',files:[{id:'40000000-0000-4000-8000-000000000001',kind:'pdf',revision_number:savedOrder.revision_count,published_at:'2026-10-18'},{id:'40000000-0000-4000-8000-000000000002',kind:'editable',revision_number:savedOrder.revision_count,published_at:'2026-10-18'}]};}}>Simulate reviewed draft (fixture only)</button>}
  <ResumeStudio />
</>);
