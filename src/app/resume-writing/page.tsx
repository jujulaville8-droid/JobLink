import Link from 'next/link';
import styles from '@/components/cv/studio/consultation.module.css';
import LegacyResumeWritingRequest from '@/components/cv/studio/LegacyResumeWritingRequest';
import ResumeWritingOffer from '@/components/cv/studio/ResumeWritingOffer';
import { getApplicationReturnTo } from '@/lib/return-to';

export const dynamic='force-dynamic';
export const metadata={title:'Résumé consultation',robots:{index:false,follow:false}};
export default async function ResumeWritingPage({searchParams}:{searchParams:Promise<{order?:string;application?:string;requests?:string}>}) {
  const query=await searchParams;
  const applicationReturnTo = getApplicationReturnTo(query.application);
  const builderHref = applicationReturnTo ? `/profile/cv?returnTo=${encodeURIComponent(applicationReturnTo)}` : '/profile/cv';
  return <main className={styles.page}>
    <Link href={builderHref}>← Free résumé builder</Link>
    <ResumeWritingOffer applicationReturnTo={applicationReturnTo} />
    {(query.order || query.requests === '1') && <LegacyResumeWritingRequest initialOrderId={query.order} applicationReturnTo={applicationReturnTo} />}
  </main>;
}
