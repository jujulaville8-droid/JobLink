import Link from 'next/link';
import LegacyResumeWritingRequest from '@/components/cv/studio/LegacyResumeWritingRequest';
import ResumeWritingOffer from '@/components/cv/studio/ResumeWritingOffer';
import { getApplicationReturnTo } from '@/lib/return-to';

export const dynamic='force-dynamic';
export const metadata={title:'Résumé consultation | JobLink',robots:{index:false,follow:false}};
export default async function ResumeWritingPage({searchParams}:{searchParams:Promise<{order?:string;application?:string;requests?:string}>}) {
  const query=await searchParams;
  const applicationReturnTo = getApplicationReturnTo(query.application);
  const builderHref = applicationReturnTo ? `/profile/cv?returnTo=${encodeURIComponent(applicationReturnTo)}` : '/profile/cv';
  return <main className="mx-auto max-w-3xl px-5 py-10">
    <Link href={builderHref}>← Free résumé builder</Link>
    <h1 className="mt-6 text-3xl font-semibold">Let’s talk about your next step</h1>
    <ResumeWritingOffer applicationReturnTo={applicationReturnTo} />
    {(query.order || query.requests === '1') && <LegacyResumeWritingRequest initialOrderId={query.order} applicationReturnTo={applicationReturnTo} />}
  </main>;
}
