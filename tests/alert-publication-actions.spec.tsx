import { beforeEach, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode, type ReactElement } from 'react';
import ApprovalsPage from '@/app/(dashboard)/admin/approvals/page';
import MyListingsPage from '@/app/(dashboard)/my-listings/page';
const s = vi.hoisted(() => ({ queue: [] as (() => Promise<unknown>)[], ids: [] as string[], fail: false, row: {} as Record<string, unknown> }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ redirect: () => {} }));
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: (fn: () => Promise<unknown>) => s.queue.push(fn) }));
vi.mock('@/lib/job-alert-matcher', () => ({ processJobAlerts: async (id: string) => { s.ids.push(id); } }));
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ id: 'owner' }), requireAuth: async () => ({ id: 'owner' }) }));
vi.mock('@/lib/email', () => ({ sendEmail: async () => {}, BASE_URL: 'https://joblinkantigua.com' }));
function db() {
  return { from: (table: string) => {
    let write = false; let inserted = false;
    const value = () => ({ error: write && s.fail ? { message: 'offline' } : null, data: write && s.fail ? null : table === 'companies' ? { id: 'company' } : inserted ? { id: 'reposted-job' } : s.row });
    const q = { select: () => q, eq: () => q, order: () => q, update: () => { write = true; return q; }, insert: () => { write = true; inserted = true; return q; }, single: async () => value(), maybeSingle: async () => value(), then: (fn: (r: unknown) => unknown) => Promise.resolve({ ...value(), data: value().data ? [value().data] : null }).then(fn) };
    return q;
  } };
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => db() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db() }));
beforeEach(() => { s.queue = []; s.ids = []; s.fail = false; s.row = { id: 'job', company_id: 'company', title: 'Chef', description: 'Kitchen', job_type: 'full_time', status: 'closed', created_at: '2026-01-01', expires_at: null, companies: null, applications: [] }; });
function find(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (predicate(child)) return child;
    const nested = find(child.props.children as ReactNode, predicate);
    if (nested) return nested;
  }
}
it('the actual admin approval form schedules matching after a successful write', async () => {
  const tree = await ApprovalsPage();
  const form = find(tree, el => el.type === 'form' && typeof el.props.action === 'function');
  expect(form).toBeDefined();
  const data = new FormData(); data.set('job_id', 'job');
  await (form!.props.action as (d: FormData) => Promise<void>)(data);
  expect(s.queue).toHaveLength(1); await s.queue[0](); expect(s.ids).toEqual(['job']);
});
it('the actual repost form schedules matching with the new listing ID', async () => {
  const tree = await MyListingsPage({ searchParams: Promise.resolve({ filter: 'closed' }) });
  const component = find(tree, el => typeof el.type === 'function' && el.type.name === 'RepostListing');
  expect(component).toBeDefined();
  const form = (component!.type as (p: Record<string, unknown>) => ReactElement<Record<string, unknown>>)(component!.props);
  await (form.props.action as () => Promise<void>)();
  expect(s.queue).toHaveLength(1); await s.queue[0](); expect(s.ids).toEqual(['reposted-job']);
});
it('a failed approval write never queues email', async () => {
  const tree = await ApprovalsPage();
  const form = find(tree, el => el.type === 'form' && typeof el.props.action === 'function');
  s.fail = true;
  const data = new FormData(); data.set('job_id', 'job');
  await expect((form!.props.action as (d: FormData) => Promise<void>)(data)).rejects.toThrow();
  expect(s.queue).toHaveLength(0);
});
