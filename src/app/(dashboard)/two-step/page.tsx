import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TwoStepLogin from '@/components/TwoStepLogin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Two-step login', robots: { index: false } };

/** Enrolment and sign-in challenge for admin accounts. */
export default async function TwoStepPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: account } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
  if (account?.is_admin !== true) redirect('/dashboard');
  const { next } = await searchParams;
  // Only same-site admin paths are honoured as a return destination.
  const destination = typeof next === 'string' && /^\/admin(\/[A-Za-z0-9\-_/]*)?$/.test(next) ? next : '/admin';
  return <TwoStepLogin destination={destination} />;
}
