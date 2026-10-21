import { writingJson, writingOwner, writingSameOrigin } from '@/lib/resume-writing-server';
import { writingConsultationUrl } from '@/lib/resume-writing';

// Retired independently of environment flags. Keep saved orders and fulfillment intact.
export async function POST(request: Request) {
  const auth = await writingOwner(); if ('error' in auth) return auth.error;
  if (!writingSameOrigin(request)) return writingJson({ error: 'Use the JobLink consultation page.' }, 403);
  return writingJson({ error: 'Online résumé checkout has been retired.', consultationUrl: writingConsultationUrl }, 410);
}
