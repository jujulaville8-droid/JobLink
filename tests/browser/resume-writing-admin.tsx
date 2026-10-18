// Synthetic test-only entry. No production route, auth bypass, sends or uploads.
import { createRoot } from 'react-dom/client';
import ResumeWritingAdmin from '../../src/components/ResumeWritingAdmin';
import { browserWritingOrder } from './resume-writing-fixture';
import '../../src/app/globals.css';
const held=new URLSearchParams(location.search).has('hold');
let order = {...browserWritingOrder,payment_status:'paid',checkout_status:'paid',payment_review_required:held,fulfillment_status:(held?'complete':'ready') as typeof browserWritingOrder.fulfillment_status,version:1};
window.fetch = async (_input,init) => {
  if (init?.method==='PATCH') { const body=JSON.parse(String(init.body));order={...order,fulfillment_status:body.status,revision_count:order.revision_count+(body.status==='revision_requested'?1:0),version:order.version+1};return Response.json({success:true}); }
  return Response.json({orders:[order],unmatched:[],hasNext:false,paymentMode:'sandbox'});
};
createRoot(document.getElementById('root')!).render(<main className="min-h-screen bg-slate-50 p-5 text-slate-800">
  <p className="mx-auto mb-6 max-w-4xl rounded border bg-amber-50 p-3">SYNTHETIC LOCAL ADMIN FIXTURE · No live orders or payment · No messages or files sent</p>
  <ResumeWritingAdmin />
</main>);
