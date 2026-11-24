import { getApplicationReturnTo } from '@/lib/return-to';
import styles from './consultation.module.css';

export default function ResumeWritingOffer({ applicationReturnTo, compact = false }: { applicationReturnTo?: string | null; compact?: boolean }) {
  const returnTo = getApplicationReturnTo(applicationReturnTo);
  const builderHref = returnTo ? `/profile/cv?returnTo=${encodeURIComponent(returnTo)}` : '/profile/cv';
  if (compact) return <section className={styles.compact} aria-label="Résumé help">
    <div><h2>Want help with your résumé?</h2><p>Optional. The builder stays free.</p><a className={styles.existing} href={`/resume-writing?requests=1${returnTo ? `&application=${encodeURIComponent(returnTo)}` : ''}`}>View existing résumé requests</a></div>
  </section>;

  return <section className={styles.offer} aria-label="Résumé help">
    <div className={styles.hero}>
      <div className={styles.copy}>
        <h1 className={styles.title}>Want help with your résumé?</h1>
        <p className={styles.lead}>The résumé builder and job applications remain free.</p>
        <a className={styles.secondary} href={builderHref}>Keep using the free résumé builder</a>
      </div>
    </div>
    <div className={styles.footer}>
      <p><a href={`/resume-writing?requests=1${returnTo ? `&application=${encodeURIComponent(returnTo)}` : ''}`}>View existing résumé requests</a></p>
      {returnTo && <p><a href={returnTo}>Return to your application</a></p>}
    </div>
  </section>;
}
