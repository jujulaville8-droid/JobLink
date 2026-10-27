import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { postingSchema } from '@/lib/job-posting';
import { derivePublishedJobCriteria } from '@/lib/employer-screening/inline-job-criteria';

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  const parsed = postingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid listing.' }, { status: 400 });
  // Preview the same mapping that runs after publication; no rubric is persisted here.
  const result = derivePublishedJobCriteria({ id: 'preview', company_id: 'preview', title: parsed.data.title, description: parsed.data.description, status: 'active' });
  return NextResponse.json({ criteria: result.criteria, status: result.status });
}
