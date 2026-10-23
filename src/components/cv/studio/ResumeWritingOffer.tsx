import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { writingConsultationUrl } from '@/lib/resume-writing';
import { getApplicationReturnTo } from '@/lib/return-to';
import styles from './consultation.module.css';

export default function ResumeWritingOffer({ applicationReturnTo, compact = false }: { applicationReturnTo?: string | null; compact?: boolean }) {
  const returnTo = getApplicationReturnTo(applicationReturnTo);
  const builderHref = returnTo ? `/profile/cv?returnTo=${encodeURIComponent(returnTo)}` : '/profile/cv';
  const booking = <a className={styles.book} href={writingConsultationUrl} target="_blank" rel="noopener noreferrer">Book a consultation <ArrowRight size={20} aria-hidden="true" /></a>;
  if (compact) return <section className={styles.compact} aria-label="Résumé consultation">
    <div><h2>Want help with your résumé?</h2><p>Optional. The builder stays free.</p><a className={styles.existing} href={`/resume-writing?requests=1${returnTo ? `&application=${encodeURIComponent(returnTo)}` : ''}`}>View existing résumé requests</a></div>
    {booking}
  </section>;

  return <section className={styles.offer} aria-label="Résumé consultation">
    <div className={styles.hero}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Résumé consultation</p>
        <h1 className={styles.title}>Let’s talk about your next step.</h1>
        <p className={styles.lead}>Talk through your résumé, the roles you want and where you need support.</p>
        {booking}
        <p className={styles.note}>Choose a time on Calendly. Opens in a new tab as “Joblinks Meeting” with QQ Solutions.</p>
        <a className={styles.secondary} href={builderHref}>Keep using the free résumé builder</a>
      </div>
      <div className={styles.art} aria-hidden="true"><Image src="/images/consultation-coast.svg" alt="" width={480} height={720} sizes="(max-width: 760px) 1px, 360px" /></div>
    </div>
    <ol className={styles.steps}><li>Choose your time</li><li>Bring your questions</li><li>Discuss your options</li></ol>
    <div className={styles.footer}>
      <p>The résumé builder and job applications remain free. Booking a consultation is optional.</p>
      <p><a href={`/resume-writing?requests=1${returnTo ? `&application=${encodeURIComponent(returnTo)}` : ''}`}>View existing résumé requests</a></p>
      {returnTo && <p><a href={returnTo}>Return to your application</a></p>}
    </div>
  </section>;
}
