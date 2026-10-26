import { beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { PATCH } from '@/app/api/admin/listings/[id]/route'
import MyListingsPage from '@/app/(dashboard)/my-listings/page'
import ApprovalsPage from '@/app/(dashboard)/admin/approvals/page'
import ReportsPage from '@/app/(dashboard)/admin/reports/page'

type Row = Record<string, unknown>
type Element = ReactElement<Record<string, unknown>>
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>, queue: [] as (() => Promise<unknown>)[],
  notify: vi.fn(), employerEmail: vi.fn(), denied: false, writeError: false, race: false,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(),
  after: (fn: () => Promise<unknown>) => state.queue.push(fn),
}))
vi.mock('@/lib/job-closure-notifications', () => ({ notifyApplicantsOfJobClosure: state.notify }))
vi.mock('@/lib/job-alert-matcher', () => ({ processJobAlerts: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendEmail: state.employerEmail, BASE_URL: 'https://joblinkantigua.com' }))
vi.mock('@/lib/auth', () => ({
  requireRole: async () => { if (state.denied) throw new Error('Forbidden'); return { id: 'owner' } },
  requireAuth: async () => { if (state.denied) throw new Error('Forbidden'); return { id: 'owner' } },
}))
vi.mock('@/lib/api-auth', () => ({ requireAdmin: async () => state.denied
  ? { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } : { user: { id: 'owner' } },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => db() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db() }))

function db() {
  return { from: (table: string) => {
    const filters: ((row: Row) => boolean)[] = []
    let update: Row | undefined, deleting = false
    const run = () => {
      if (update && state.writeError) return { data: null, error: { code: 'offline' } }
      // A different request changes the row between the read and conditional write.
      if (update && state.race) state.tables.job_listings[0].status = 'pending_approval'
      const rows = state.tables[table].filter(row => filters.every(fn => fn(row)))
      if (update) rows.forEach(row => Object.assign(row, update))
      if (deleting) state.tables[table] = state.tables[table].filter(row => !rows.includes(row))
      return { data: structuredClone(rows), error: null }
    }
    const query = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query },
      update: (value: Row) => { update = value; return query }, delete: () => { deleting = true; return query },
      single: async () => { const result = run(); return { data: result.data?.[0] ?? null,
        error: result.error || (!result.data?.length ? { code: 'PGRST116' } : null) } },
      maybeSingle: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null } },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    }
    return query
  } }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.queue = []; state.denied = false; state.writeError = false; state.race = false
  const listing = { id: 'job', company_id: 'company', title: 'Chef', description: 'Kitchen', status: 'active',
    job_type: 'full_time', created_at: '2026-10-01', location: 'Antigua', companies: { user_id: 'owner', company_name: 'Hotel' }, applications: [] }
  state.tables = {
    job_listings: [listing], companies: [{ id: 'company', user_id: 'owner' }],
    users: [{ id: 'owner', email: 'employer@example.com' }],
    reported_listings: [{ id: 'report', reason: 'Unavailable', created_at: '2026-10-01', job_listings: listing, users: null }],
  }
})

function find(node: ReactNode, predicate: (el: Element) => boolean): Element | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue
    if (predicate(child)) return child
    const nested = find(child.props.children as ReactNode, predicate)
    if (nested) return nested
  }
}
const formData = () => {
  const form = new FormData(); form.set('job_id', 'job'); form.set('report_id', 'report'); form.set('rejection_reason', 'Needs details')
  return form
}
const patch = () => PATCH(new NextRequest('http://localhost/api/admin/listings/job', {
  method: 'PATCH', body: JSON.stringify({ status: 'closed' }),
}), { params: Promise.resolve({ id: 'job' }) })

async function actionFor(path: 'employer' | 'approvals' | 'reports'): Promise<() => Promise<void>> {
  if (path === 'employer') {
    const tree = await MyListingsPage({ searchParams: Promise.resolve({}) })
    const component = find(tree, el => typeof el.type === 'function' && el.type.name === 'CloseListing')!
    expect(component).toBeDefined()
    const form = (component.type as (props: Record<string, unknown>) => Element)(component.props)
    return form.props.action as () => Promise<void>
  }
  if (path === 'approvals') {
    // Capture a pending form, then simulate the job going live before submission.
    state.tables.job_listings[0].status = 'pending_approval'
    const tree = await ApprovalsPage()
    const button = find(tree, el => typeof el.props.rejectAction === 'function')!
    expect(button).toBeDefined()
    state.tables.job_listings[0].status = 'active'
    return () => (button.props.rejectAction as (data: FormData) => Promise<void>)(formData())
  }
  const tree = await ReportsPage()
  const form = find(tree, el => el.type === 'form' &&
    Boolean(find(el.props.children as ReactNode, child => child.type === 'input' && child.props.name === 'job_id')))!
  expect(form).toBeDefined()
  return () => (form.props.action as (data: FormData) => Promise<void>)(formData())
}

it('the admin PATCH schedules active -> closed once and preserves pending rejection email', async () => {
  expect((await patch()).status).toBe(200)
  expect(state.notify).not.toHaveBeenCalled()
  expect(state.queue).toHaveLength(1)
  await state.queue[0]()
  expect(state.notify).toHaveBeenCalledExactlyOnceWith('job')
  expect((await patch()).status).toBe(200)
  expect(state.queue).toHaveLength(1)
  expect(state.employerEmail).not.toHaveBeenCalled()
  state.tables.job_listings[0].status = 'pending_approval'
  expect((await patch()).status).toBe(200)
  expect(state.queue).toHaveLength(1)
  expect(state.employerEmail).toHaveBeenCalledWith({ to: 'employer@example.com', type: 'listing_rejected', data: { listing_title: 'Chef' } })
})

it.each(['write failure', 'concurrent status change', 'unauthorized'])('admin PATCH does not notify after %s', async scenario => {
  state.writeError = scenario === 'write failure'; state.race = scenario === 'concurrent status change'; state.denied = scenario === 'unauthorized'
  expect((await patch()).status).toBe(scenario === 'write failure' ? 500 : scenario === 'unauthorized' ? 403 : 409)
  expect(state.queue).toHaveLength(0)
  expect(state.tables.job_listings[0].status).not.toBe('closed')
})

for (const path of ['employer', 'approvals', 'reports'] as const) {
  it(`the actual ${path} action schedules only the first active close`, async () => {
    const action = await actionFor(path)
    await action(); await action()
    expect(state.tables.job_listings[0].status).toBe('closed')
    expect(state.notify).not.toHaveBeenCalled()
    expect(state.queue).toHaveLength(1)
    await state.queue[0]()
    expect(state.notify).toHaveBeenCalledExactlyOnceWith('job')
  })
  it(`the ${path} action does not notify on pending -> closed`, async () => {
    const action = await actionFor(path)
    state.tables.job_listings[0].status = 'pending_approval'
    await action()
    expect(state.queue).toHaveLength(0)
    expect(state.tables.job_listings[0].status).toBe(path === 'employer' ? 'pending_approval' : 'closed')
    if (path === 'approvals') expect(state.employerEmail).toHaveBeenCalledWith(expect.objectContaining({
      type: 'listing_rejected', data: expect.objectContaining({ rejection_reason: 'Needs details' }),
    }))
  })
  it.each(['write failure', 'concurrent status change', 'unauthorized'])(`the ${path} action does not notify after %s`, async scenario => {
    const action = await actionFor(path)
    state.writeError = scenario === 'write failure'; state.race = scenario === 'concurrent status change'; state.denied = scenario === 'unauthorized'
    await expect(action()).rejects.toThrow()
    expect(state.queue).toHaveLength(0)
    expect(state.tables.job_listings[0].status).not.toBe('closed')
    expect(state.tables.reported_listings).toHaveLength(1)
  })
}

it('an employer cannot close a listing after it moves to another company', async () => {
  const action = await actionFor('employer')
  state.tables.job_listings[0].company_id = 'different-company'
  await expect(action()).rejects.toThrow()
  expect(state.tables.job_listings[0].status).toBe('active')
  expect(state.queue).toHaveLength(0)
})
