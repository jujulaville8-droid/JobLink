import { writingConsultationUrl } from '@/lib/resume-writing';
import { getApplicationReturnTo } from '@/lib/return-to';
import styles from './studio.module.css';

export default function ResumeWritingOffer({ applicationReturnTo }: { applicationReturnTo?: string | null }) {
  const returnTo = getApplicationReturnTo(applicationReturnTo);
  const builderHref = returnTo ? `/profile/cv?returnTo=${encodeURIComponent(returnTo)}` : '/profile/cv';

  return <section className={styles.purchase} aria-label="Résumé consultation">
    <div className={styles.purchaseOffer}>
      <div className={styles.purchasePitch}>
        <h2>Not sure what your résumé needs? Let’s talk.</h2>
        <p className={styles.purchaseLead}>Whether you’re applying for your first job or ready for a new role, start with a conversation about your experience, your résumé and the work you’re looking for.</p>
        <ul className={styles.purchaseIncludes}>
          <li>Talk through the roles you want to apply for.</li>
          <li>Discuss how to present your experience and strengths.</li>
          <li>Work out what support would be useful next.</li>
        </ul>
        <a className={`${styles.primary} ${styles.purchaseCta}`} href={writingConsultationUrl} target="_blank" rel="noopener noreferrer">Book a consultation</a>
        <p className={styles.purchaseStartNote}>Choose a time on Calendly. Opens in a new tab as “Joblinks Meeting” with QQ Solutions.</p>
      </div>
      <div>
        <h3>A conversation before your next step</h3>
        <ol className={styles.purchaseProcess}>
          <li><strong>Choose your time</strong><span>Find a consultation slot that works for you.</span></li>
          <li><strong>Bring your questions</strong><span>Have your current résumé handy if you have one, and think about the roles that interest you.</span></li>
          <li><strong>Discuss your options</strong><span>Talk about where you need help and decide what to do next.</span></li>
        </ol>
        <p className={styles.purchaseFree}>The résumé builder and job applications remain free. Booking a consultation is optional.</p>
        <a href={builderHref}>Keep using the free résumé builder</a>
        <p><a href={`/resume-writing?requests=1${returnTo ? `&application=${encodeURIComponent(returnTo)}` : ''}`}>View existing résumé requests</a></p>
        {returnTo && <p><a href={returnTo}>Return to your application</a></p>}
      </div>
    </div>
  </section>;
}
