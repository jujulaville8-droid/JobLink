import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { adminTwoStepEnforced, hasTwoStepSession } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * Once ADMIN_MFA_ENFORCED is on, an admin session that has not passed two-step
 * login is sent to /two-step before any admin page renders. The admin API
 * routes refuse the same sessions on their own (see requireAdmin).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (adminTwoStepEnforced()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && !(await hasTwoStepSession(supabase))) redirect('/two-step');
  }
  return <>{children}</>;
}
