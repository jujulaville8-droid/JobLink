import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { alertCriteriaSchema, sameAlert } from '@/lib/job-alert-criteria';
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit';

const fields = 'id, keywords, industry, job_type, created_at';
const fail = (error: string, status: number, code?: string) => NextResponse.json({ error, code }, { status });

async function context() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return { error: fail('Please sign in to manage alerts.', 401, 'sign_in') };
  const { data: account, error: accountError } = await db.from('users').select('email_verified, is_banned, is_admin').eq('id', user.id).maybeSingle();
  if (accountError) return { error: fail('Unable to load your account. Try again.', 503) };
  if (account?.is_banned) return { error: fail('This account cannot manage alerts.', 403) };
  if (!account?.is_admin && (!user.email_confirmed_at || !account?.email_verified)) return { error: fail('Verify your email to receive alerts.', 403, 'verify_email') };
  const { data: profile, error: profileError } = await db.from('seeker_profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (profileError) return { error: fail('Unable to load your profile. Try again.', 503) };
  if (!profile) return { error: fail('Complete your job seeker profile to create alerts.', 403, 'profile_required') };
  return { db, profile, user };
}

export async function GET() {
  try {
    const ctx = await context();
    if ('error' in ctx) return ctx.error!;
    const { data, error } = await ctx.db.from('job_alerts').select(fields).eq('seeker_id', ctx.profile.id).order('created_at', { ascending: false });
    if (error) return fail('Unable to load alerts. Try again.', 503);
    return NextResponse.json({ alerts: data || [], email: ctx.user.email }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return fail('Unable to load alerts. Try again.', 503); }
}

async function save(request: Request, editing: boolean) {
  try {
    const ctx = await context();
    if ('error' in ctx) return ctx.error!;
    const limited = await enforceRateLimit(`alert:${ctx.user.id}`, RateLimits.alert);
    if (limited) return limited;
    const body = await request.json().catch(() => null);
    const parsed = alertCriteriaSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Check your alert criteria.', 400);
    const id = editing ? z.uuid().safeParse(body.id) : null;
    if (id && !id.success) return fail('Invalid alert.', 400);
    const { data: existing, error: readError } = await ctx.db.from('job_alerts').select(fields).eq('seeker_id', ctx.profile.id);
    if (readError) return fail('Unable to check saved alerts. Try again.', 503);
    const editingId = id?.success ? id.data : null;
    if (editingId && !existing?.some(alert => alert.id === editingId)) return fail('Alert not found.', 404);
    const duplicate = existing?.find(alert => alert.id !== editingId && sameAlert(alert, parsed.data));
    if (duplicate) return NextResponse.json({ exists: true, error: 'You already have an alert with these criteria.', alert: duplicate }, { status: 409 });
    const query = editingId
      ? ctx.db.from('job_alerts').update(parsed.data).eq('id', editingId).eq('seeker_id', ctx.profile.id)
      : ctx.db.from('job_alerts').insert({ ...parsed.data, seeker_id: ctx.profile.id });
    const { data: alert, error } = await query.select(fields).single();
    if (error || !alert) return fail('Unable to save your alert. Try again.', 503);
    return NextResponse.json({ alert }, { status: editing ? 200 : 201 });
  } catch { return fail('Unable to save your alert. Try again.', 503); }
}

export const POST = (request: Request) => save(request, false);
export const PATCH = (request: Request) => save(request, true);

export async function DELETE(request: Request) {
  try {
    const ctx = await context();
    if ('error' in ctx) return ctx.error!;
    const limited = await enforceRateLimit(`alert:${ctx.user.id}`, RateLimits.alert);
    if (limited) return limited;
    const body = await request.json().catch(() => null);
    const id = z.uuid().safeParse(body?.id);
    if (!id.success) return fail('Invalid alert.', 400);
    const { data, error } = await ctx.db.from('job_alerts').delete().eq('id', id.data).eq('seeker_id', ctx.profile.id).select('id');
    if (error) return fail('Unable to delete your alert. Try again.', 503);
    if (!data?.length) return fail('Alert not found.', 404);
    return NextResponse.json({ success: true });
  } catch { return fail('Unable to delete your alert. Try again.', 503); }
}
