import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseFilterQuery, type ApplicationFilterOptions } from '@/lib/admin-applications';
import { count, record, rows, text, uuid } from '../_data';
import { applicationReadError, privateJson, privateResponse } from '../_response';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) return privateResponse(auth.error);

    const parsed = parseFilterQuery(request.nextUrl.searchParams);
    if (!parsed.value) return privateJson({ error: parsed.error }, 400);
    const { kind, q, companyId, page, limit } = parsed.value;

    const admin = createAdminClient();
    const nameColumn = kind === 'company' ? 'company_name' : 'title';
    let query = admin.from(kind === 'company' ? 'companies' : 'job_listings')
      .select(`id,${nameColumn}`, { count: 'exact' })
      .order(nameColumn, { ascending: true })
      .order('id', { ascending: true });
    if (q) query = query.ilike(nameColumn, `%${q.replace(/[\\%_]/g, character => `\\${character}`)}%`);
    if (companyId && kind === 'job') query = query.eq('company_id', companyId);
    const { data, error, count: totalCount } = await query.range((page - 1) * limit, page * limit - 1);
    if (error) return applicationReadError();

    const options: ApplicationFilterOptions = {
      page, limit, totalCount: count(totalCount),
      items: rows(data).map(value => {
        const option = record(value);
        return { id: uuid(option.id), name: text(option[nameColumn]) };
      }),
    };
    return privateJson(options);
  } catch {
    return applicationReadError();
  }
}
