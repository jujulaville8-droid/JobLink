import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  parseApplicantQuery, UUID_PATTERN,
} from '@/lib/admin-applications';
import { readJobApplicants } from '../../../_reads';
import { applicationReadError, privateJson, privateResponse } from '../../../_response';

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) return privateResponse(auth.error);

    const { jobId } = await params;
    if (!UUID_PATTERN.test(jobId)) return privateJson({ error: 'Invalid job ID.' }, 400);
    const parsed = parseApplicantQuery(request.nextUrl.searchParams);
    if (!parsed.value) return privateJson({ error: parsed.error }, 400);
    const query = parsed.value;

    const admin = createAdminClient();
    const applicants = await readJobApplicants(admin, jobId, query, request.signal);
    if (applicants == null) return privateJson({ error: 'Job not found.' }, 404);
    return privateJson(applicants);
  } catch {
    return applicationReadError();
  }
}
