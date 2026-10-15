import ResumeStudio from '@/components/cv/studio/ResumeStudio';
import { getApplicationReturnTo } from '@/lib/return-to';

export const metadata = { title: 'Resume Builder', robots: { index: false, follow: false } };

export default async function ResumeBuilderPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const { returnTo } = await searchParams;
  const applicationReturnTo = getApplicationReturnTo(typeof returnTo === 'string' ? returnTo : null);
  return <ResumeStudio applicationReturnTo={applicationReturnTo} />;
}
