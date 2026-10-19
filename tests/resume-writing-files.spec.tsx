// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {writingAdmin,writingId,writingUser} from './fixtures/resume-writing';
import {syntheticPdf,syntheticDocx} from './fixtures/resume-writing-files';
const m=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn(),rpc:vi.fn(),from:vi.fn(),reconcile:vi.fn(),bucket:vi.fn(),upload:vi.fn(),download:vi.fn(),filters:[] as [string,unknown][],order:null as unknown,file:null as unknown}));
vi.mock('server-only',()=>({}));vi.mock('@/lib/api-auth',()=>({requireVerifiedUser:m.auth,requireAdmin:m.admin}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:m.from,rpc:m.rpc,storage:{getBucket:m.bucket,from:()=>({upload:m.upload,download:m.download})}})}));
vi.mock('@/lib/resume-writing-stripe',async()=>({...await vi.importActual<typeof import('@/lib/resume-writing-stripe')>('@/lib/resume-writing-stripe'),getResumeWritingStripe:()=>({})}));
vi.mock('@/lib/resume-writing-payment',()=>({reconcileResumeWritingSession:m.reconcile,resumeWritingPayment:{accountId:'fixture'}}));
import {validateWritingFile,writingFileLimit,writingHash,writingMime,writingMultipart} from '@/lib/resume-writing-files';
import {POST as upload} from '@/app/api/admin/resume-writing/[id]/files/route';
import {GET as download} from '@/app/api/resume-writing/orders/[id]/files/[fileId]/route';
import {PATCH as publish} from '@/app/api/admin/resume-writing/[id]/route';
const fileId='40000000-0000-4000-8000-000000000001',otherFile='40000000-0000-4000-8000-000000000002';const params={params:Promise.resolve({id:writingId,fileId})};
function multipart(bytes=syntheticPdf,kind='pdf',origin='https://joblink.test'){const form=new FormData();form.set('id',fileId);form.set('version','4');form.set('kind',kind);form.set('file',new Blob([new Uint8Array(bytes)],{type:writingMime[kind as 'pdf'|'editable']}),kind==='pdf'?'synthetic.pdf':'synthetic.docx');return new Request(`https://joblink.test/api/admin/resume-writing/${writingId}/files`,{method:'POST',headers:{origin},body:form});}
const patch=(body:unknown)=>new Request('https://joblink.test/api/admin/resume-writing/'+writingId,{method:'PATCH',headers:{origin:'https://joblink.test','content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv('RESUME_WRITING_ENABLED','true');vi.stubEnv('RESUME_WRITING_PAYMENT_MODE','live');m.filters=[];
  m.auth.mockResolvedValue({user:{id:writingUser},supabase:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'seeker'}})})})})}});m.admin.mockResolvedValue({user:{id:writingAdmin}});
  m.order={intake:{name:'Jane Smith'},paid_session_id:'cs_live_Synthetic',version:4,fulfillment_status:'writing',intake_status:'complete',revision_count:0,payment_status:'paid',payment_review_required:false};
  m.file={id:fileId,kind:'pdf',object_path:`${writingId}/0/${fileId}.pdf`,sha256:writingHash(syntheticPdf),size:syntheticPdf.length,published_at:'2026-10-18'};
  m.from.mockImplementation((table:string)=>{const q={select:()=>q,eq:(key:string,value:unknown)=>{m.filters.push([key,value]);return q;},not:(...args:unknown[])=>{m.filters.push(['not',args]);return q;},in:()=>q,maybeSingle:async()=>({data:table==='resume_writing_orders'?m.order:m.file,error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[m.file,{...(m.file as object),id:otherFile,kind:'editable'}],error:null}).then(resolve)};return q;});
  m.bucket.mockResolvedValue({data:{public:false},error:null});m.upload.mockResolvedValue({data:{},error:null});m.download.mockResolvedValue({data:new Blob([new Uint8Array(syntheticPdf)]),error:null});m.rpc.mockResolvedValue({data:{id:fileId},error:null});m.reconcile.mockResolvedValue({outcome:'applied'});
});
afterEach(()=>vi.unstubAllEnvs());
describe('bounded actual document formats',()=>{
  it('keeps multipart requests and authenticated downloads below the hosting payload cap',()=>{
    expect(writingFileLimit+128*1024).toBeLessThan(4_500_000);
    const max=Buffer.alloc(writingFileLimit,32);syntheticPdf.copy(max);Buffer.from('%%EOF').copy(max,max.length-5);
    expect(()=>validateWritingFile(max,'pdf')).not.toThrow();
    expect(()=>validateWritingFile(Buffer.concat([max,Buffer.from(' ')]),'pdf')).toThrow('3 MB');
  });
  it('accepts synthetic PDF and actual DOCX structure, rejects renamed bytes and malformed ZIP',()=>{expect(()=>validateWritingFile(syntheticPdf,'pdf')).not.toThrow();expect(()=>validateWritingFile(syntheticDocx(),'editable')).not.toThrow();expect(()=>validateWritingFile(Buffer.from('not pdf'),'pdf')).toThrow();expect(()=>validateWritingFile(syntheticPdf,'editable')).toThrow();const zip=syntheticDocx();zip.writeUInt16LE(2000,zip.length-12);expect(()=>validateWritingFile(zip,'editable')).toThrow();expect(()=>validateWritingFile(Buffer.alloc(3145729),'pdf')).toThrow();});
  it('rejects cross-origin and oversized streaming multipart bodies',async()=>{await expect(writingMultipart(multipart(syntheticPdf,'pdf','https://evil.test'))).rejects.toThrow();const request=new Request('https://joblink.test/upload',{method:'POST',headers:{origin:'https://joblink.test','content-type':'multipart/form-data; boundary=fixture'},body:new Uint8Array(3*1024*1024+128*1024+1)});await expect(writingMultipart(request)).rejects.toThrow('3 MB');});
});
describe('private document lifecycle HTTP boundaries',()=>{
  it('touches no new tables, storage or Stripe when the service is disabled',async()=>{
    vi.stubEnv('RESUME_WRITING_ENABLED','false');
    expect((await upload(multipart(),params)).status).toBe(503);expect((await download(new Request('https://joblink.test/download'),params)).status).toBe(503);
    expect((await publish(patch({action:'publish',version:4,fileIds:[fileId,otherFile],humanReviewed:true}),params)).status).toBe(503);
    expect(m.from).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();expect(m.bucket).not.toHaveBeenCalled();expect(m.upload).not.toHaveBeenCalled();expect(m.download).not.toHaveBeenCalled();expect(m.reconcile).not.toHaveBeenCalled();
  });
  it('requires admin before reading upload bytes and never exposes storage publicly',async()=>{m.admin.mockResolvedValue({error:Response.json({error:'Forbidden'},{status:403})});expect((await upload(multipart(),params)).status).toBe(403);expect(m.upload).not.toHaveBeenCalled();});
  it('stages under an exact order/round/id path after fresh payment, registers a hash and never upserts',async()=>{expect((await upload(multipart(),params)).status).toBe(201);expect(m.reconcile).toHaveBeenCalledTimes(1);expect(m.upload).toHaveBeenCalledWith(`${writingId}/0/${fileId}.pdf`,syntheticPdf,{contentType:'application/pdf',upsert:false});expect(m.rpc).toHaveBeenCalledWith('register_resume_writing_file',expect.objectContaining({p_actor_id:writingAdmin,p_order_id:writingId,p_version:4,p_sha256:writingHash(syntheticPdf)}));});
  it('recovers an uncertain identical upload but refuses replacing different bytes',async()=>{m.upload.mockResolvedValue({error:{message:'already exists'}});expect((await upload(multipart(),params)).status).toBe(201);m.download.mockResolvedValue({data:new Blob(['other']),error:null});expect((await upload(multipart(),params)).status).toBe(503);expect(m.rpc).toHaveBeenCalledTimes(1);});
  it.each([{intake_status:'draft'},{payment_status:'refunded'},{payment_review_required:true},{version:3}])('blocks unavailable upload %j',async(extra)=>{m.order={...(m.order as object),...extra};expect((await upload(multipart(),params)).status).toBe(409);expect(m.upload).not.toHaveBeenCalled();});
  it('rejects a public bucket or an unverified format, and does not register or publish',async()=>{m.bucket.mockResolvedValue({data:{public:true},error:null});expect((await upload(multipart(),params)).status).toBe(400);expect(m.upload).not.toHaveBeenCalled();expect((await upload(multipart(Buffer.from('renamed'),'editable'),params)).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled();});
  it('requires human review and verifies both stored byte hashes before publication',async()=>{const body={version:4,status:'draft_ready',reviewed:true,pdfId:fileId,editableId:otherFile};expect((await publish(patch({...body,reviewed:false}),params)).status).toBe(400);expect((await publish(patch(body),params)).status).toBe(200);expect(m.download).toHaveBeenCalledTimes(2);expect(m.rpc).toHaveBeenCalledWith('publish_resume_writing_draft',expect.objectContaining({p_reviewed:true,p_actor_id:writingAdmin}));m.download.mockResolvedValue({data:new Blob(['changed']),error:null});expect((await publish(patch(body),params)).status).toBe(503);});
  it('downloads only an owned published current-round file, with private attachment headers and intact bytes',async()=>{const response=await download(new Request('https://joblink.test/download'),params);expect(response.status).toBe(200);expect(m.filters).toContainEqual(['user_id',writingUser]);expect(m.filters).toContainEqual(['revision_number',0]);expect(m.filters).toContainEqual(['not',['published_at','is',null]]);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('content-disposition')).toContain('filename="Jane Smith Resume.pdf"');expect(Buffer.from(await response.arrayBuffer())).toEqual(syntheticPdf);});
  it('names editable downloads from the order intake and preserves DOCX bytes and MIME',async()=>{
    const bytes=syntheticDocx();
    m.file={...(m.file as object),kind:'editable',object_path:`${writingId}/0/${fileId}.docx`,sha256:writingHash(bytes),size:bytes.length};
    m.download.mockResolvedValue({data:new Blob([new Uint8Array(bytes)]),error:null});
    const response=await download(new Request('https://joblink.test/download'),params);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('filename="Jane Smith Resume.docx"');
    expect(response.headers.get('content-type')).toBe(writingMime.editable);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });
  it('preserves Unicode intake names in the encoded attachment filename',async()=>{
    m.order={...(m.order as object),intake:{name:'José 李'}};
    const response=await download(new Request('https://joblink.test/download'),params);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain(`filename*=UTF-8''${encodeURIComponent('José 李 Resume.pdf')}`);
  });
  it.each([undefined,null,{}, {name:''}, {name:'   '}, {name:42}])('uses a neutral fallback for missing or invalid intake names: %j',async(intake)=>{
    m.order={...(m.order as object),intake};
    const response=await download(new Request('https://joblink.test/download'),params);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('filename="Resume.pdf"');
  });
  it('refuses another owner before provider/storage lookup, holds, and private byte corruption',async()=>{m.order=null;expect((await download(new Request('https://joblink.test/download'),params)).status).toBe(404);expect(m.download).not.toHaveBeenCalled();m.order={paid_session_id:'cs_live_Synthetic',payment_status:'paid',payment_review_required:true,revision_count:0};expect((await download(new Request('https://joblink.test/download'),params)).status).toBe(409);m.order={...(m.order as object),payment_review_required:false};m.download.mockResolvedValue({data:new Blob(['changed']),error:null});expect((await download(new Request('https://joblink.test/download'),params)).status).toBe(503);});
  it('allows staged review downloads only through verified admin auth',async()=>{m.admin.mockResolvedValue({error:Response.json({error:'Forbidden'},{status:403})});expect((await download(new Request('https://joblink.test/download?review=true'),params)).status).toBe(403);expect(m.download).not.toHaveBeenCalled();});
});
