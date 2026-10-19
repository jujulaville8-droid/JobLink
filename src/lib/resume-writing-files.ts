import 'server-only';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writingSameOrigin } from './resume-writing-server';

export const writingBucket = 'resume-writing-private';
export const writingFileLimit = 3 * 1024 * 1024;
export const writingMime = { pdf:'application/pdf',editable:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } as const;
export const writingHash = (bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');

// Inspect bounded actual bytes; a renamed arbitrary ZIP is not an editable résumé.
export function validateWritingFile(bytes:Buffer,kind:'pdf'|'editable') {
  if (!bytes.length || bytes.length>writingFileLimit) throw new Error('Choose a file up to 3 MB.');
  if (kind==='pdf') {
    if (!/^%PDF-1\.[0-9]/.test(bytes.subarray(0,12).toString('ascii')) || !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) throw new Error('Choose a valid PDF.');
    return;
  }
  const end=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if(end<0 || end+22>bytes.length || bytes.readUInt16LE(end+4)!==0 || bytes.readUInt16LE(end+6)!==0) throw new Error('Choose a valid DOCX.');
  const entries=bytes.readUInt16LE(end+10);let cursor=bytes.readUInt32LE(end+16);let total=0;
  if(entries<3 || entries>1000)throw new Error('Choose a valid DOCX.');
  const required=new Map<string,string>();
  for(let i=0;i<entries;i++) {
    if(cursor+46>end || bytes.readUInt32LE(cursor)!==0x02014b50)throw new Error('Choose a valid DOCX.');
    const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24);
    const nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42);
    const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8');total+=size;
    if(flags&1 || ![0,8].includes(method) || total>20*1024*1024 || name.includes('..') || name.startsWith('/') || /vbaProject|\.exe$/i.test(name))throw new Error('Unsupported DOCX contents.');
    if(['[Content_Types].xml','word/document.xml','_rels/.rels'].includes(name)) {
      if(required.has(name) || offset+30>cursor || bytes.readUInt32LE(offset)!==0x04034b50)throw new Error('Choose a valid DOCX.');
      const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);
      if(start+compressed>cursor || size>2*1024*1024)throw new Error('Unsupported DOCX contents.');
      const data=bytes.subarray(start,start+compressed);const decoded=method===0?data:inflateRawSync(data,{maxOutputLength:2*1024*1024});
      if(decoded.length!==size)throw new Error('Choose a valid DOCX.');required.set(name,decoded.toString('utf8'));
    }
    cursor+=46+nameLength+extra+comment;
  }
  if(cursor!==end || !required.get('[Content_Types].xml')?.includes('wordprocessingml.document.main+xml') || !required.get('word/document.xml')?.includes('document') || !required.get('_rels/.rels')?.includes('officeDocument'))throw new Error('Choose a valid DOCX.');
}
export async function writingMultipart(request:Request) {
  if(!writingSameOrigin(request) || !request.headers.get('content-type')?.startsWith('multipart/form-data;'))throw new Error('Use the upload form.');
  const limit=writingFileLimit+128*1024;
  if(Number(request.headers.get('content-length'))>limit)throw new Error('Choose a file up to 3 MB.');
  const reader=request.body?.getReader();if(!reader)throw new Error('Choose a file.');
  const chunks:Uint8Array[]=[];let size=0;
  try { while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new Error('Choose a file up to 3 MB.');}chunks.push(part.value);} }
  finally{reader.releaseLock();}
  return new Response(Buffer.concat(chunks),{headers:{'content-type':request.headers.get('content-type')!}}).formData();
}
export async function privateWritingStorage(db:SupabaseClient) {
  const result=await db.storage.getBucket(writingBucket);
  if(result.error || !result.data || result.data.public!==false)throw new Error('Private storage unavailable.');
  return db.storage.from(writingBucket);
}
export async function verifiedWritingBytes(db:SupabaseClient,file:{object_path:string;sha256:string;size:number}) {
  const storage=await privateWritingStorage(db);const result=await storage.download(file.object_path);
  if(result.error || !result.data)throw new Error('Document unavailable.');
  const bytes=Buffer.from(await result.data.arrayBuffer());
  if(bytes.length!==file.size || writingHash(bytes)!==file.sha256)throw new Error('Document integrity check failed.');
  return bytes;
}
