import Link from 'next/link';
import ResumeWritingOffer from '@/components/cv/studio/ResumeWritingOffer';
import { writingConfig } from '@/lib/resume-writing-server';
import { getApplicationReturnTo } from '@/lib/return-to';

export const dynamic='force-dynamic';
export const metadata={title:'Optional résumé writing | JobLink',robots:{index:false,follow:false}};
export default async function ResumeWritingPage({searchParams}:{searchParams:Promise<{order?:string;application?:string}>}) {
  const query=await searchParams;
  return <main className="mx-auto max-w-3xl px-5 py-10">
    <Link href="/profile/cv">← Free résumé builder</Link>
    <h1 className="mt-6 text-3xl font-semibold">A little help getting started</h1>
    <ResumeWritingOffer initialConfig={writingConfig()} initialOrderId={query.order} applicationReturnTo={getApplicationReturnTo(query.application)} />
  </main>;
}
