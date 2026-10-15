import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseOverviewQuery } from '@/lib/admin-applications';
import { readApplicationOverview } from '../_reads';
import { applicationReadError, privateJson, privateResponse } from '../_response';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) return privateResponse(auth.error);

    const parsed = parseOverviewQuery(request.nextUrl.searchParams);
    if (!parsed.value) return privateJson({ error: parsed.error }, 400);
    const query = parsed.value;

    const admin = createAdminClient();
    const overview = await readApplicationOverview(admin, query, request.signal);
    return privateJson(overview);
  } catch {
    return applicationReadError();
  }
}
