import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/api-auth';
import { postingSchema, templateDescription } from '@/lib/job-posting';
import { generateDescription } from '@/lib/job-description-draft';
import { consumeRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedUser();
  if ('error' in auth) return auth.error;
  const { data: company } = await auth.supabase.from('companies').select('id').eq('user_id', auth.user.id).maybeSingle();
  if (!company) return NextResponse.json({ error: 'Complete your company profile first.' }, { status: 403 });
  const parsed = postingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid job basics.' }, { status: 400 });
  const limit = await consumeRateLimit(`job-description:${auth.user.id}`, { limit: 10, windowSeconds: 3600 });
  if (!limit.allowed) return NextResponse.json({ description: templateDescription(parsed.data), source: 'template' });
  return NextResponse.json(await generateDescription(parsed.data, { enabled: process.env.JOB_DESCRIPTION_AI_ENABLED === 'true', apiKey: process.env.OPENAI_API_KEY }));
}
