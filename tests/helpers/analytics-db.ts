import { vi } from 'vitest';

type Row = Record<string, unknown>;
export function analyticsDb() {
  const rows: Record<string, Row[]> = {
    users: [{ id: 'owner', role: 'employer', email_verified: true }],
    companies: [{ id: 'company-a', user_id: 'owner', company_name: 'Acme' }],
    job_listings: [], applications: [], messages: [],
  };
  const failures = new Set<string>();
  const calls: { table: string; filters: [string, string, unknown][]; select: string }[] = [];
  const user = { id: 'owner', email_confirmed_at: '2026-01-01', user_metadata: { role: 'employer' } };
  const auth = { getUser: vi.fn(async () => ({ data: { user: user as typeof user | null }, error: null as unknown })) };
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] as [string, string, unknown][], select: '' };
    calls.push(call);
    let single = false, head = false;
    let limit = 500;
    const query = {
      select: (fields: string, options?: { head?: boolean }) => { call.select = fields; head = !!options?.head; return query; },
      eq: (field: string, value: unknown) => { call.filters.push(['eq', field, value]); return query; },
      gt: (field: string, value: unknown) => { call.filters.push(['gt', field, value]); return query; },
      gte: (field: string, value: unknown) => { call.filters.push(['gte', field, value]); return query; },
      lt: (field: string, value: unknown) => { call.filters.push(['lt', field, value]); return query; },
      order: () => query,
      limit: (n: number) => { limit = Math.min(n, 317); return query; },
      single: () => { single = true; return query; },
      maybeSingle: () => { single = true; return query; },
      then: (resolve: (result: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const selected = (rows[table] ?? []).filter(row => call.filters.every(([op, field, value]) => {
          const actual = row[field];
          return op === 'eq' ? actual === value : op === 'gt' ? String(actual) > String(value) : op === 'gte' ? String(actual) >= String(value) : String(actual) < String(value);
        })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
        return Promise.resolve({ data: head ? null : single ? selected[0] ?? null : selected.slice(0, limit), count: selected.length, error: failures.has(table) ? new Error('unavailable') : null }).then(resolve, reject);
      },
    };
    return query;
  });
  return { rows, failures, calls, auth, from, user };
}
