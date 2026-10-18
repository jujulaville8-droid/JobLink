import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/api-auth';
import ResumeWritingAdmin from '@/components/ResumeWritingAdmin';

export const dynamic = 'force-dynamic';
export default async function ResumeWritingOrdersPage() {
  const auth = await requireAdmin();
  if ('error' in auth) redirect('/dashboard');
  return <ResumeWritingAdmin />;
}
