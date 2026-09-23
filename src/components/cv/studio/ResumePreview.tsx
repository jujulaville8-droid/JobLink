import type { CvFull } from '@/lib/types';
import { resumeSections } from '@/lib/resume-document';
import styles from './studio.module.css';

export default function ResumePreview({ cv, active }: { cv: CvFull; active: string }) {
  const sections = resumeSections(cv);
  return <div className={styles.paper}>
    <header className={styles.paperHeader}>
      <h2>{[cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(' ') || 'Your name'}</h2>
      {cv.profile.job_title && <p className={styles.paperRole}>{cv.profile.job_title}</p>}
      <p className={styles.paperContact}>{[cv.contact.location, cv.contact.email, cv.contact.phone].filter(Boolean).join(' · ')}</p>
    </header>
    {sections.length ? sections.map(section => <section className={styles.paperSection} data-active={active === section.key || (active === 'profile' && section.key === 'summary')} key={section.key}>
      <h3>{section.title}</h3>
      {section.entries.map((entry, index) => <div className={styles.paperEntry} key={index}>
        <div className={styles.paperEntryHeading}>{entry.title && <strong>{entry.title}</strong>}{entry.dates && <span>{entry.dates}</span>}</div>
        {entry.subtitle && <p className={styles.paperSubtitle}>{entry.subtitle}</p>}
        {entry.detail && <p className={styles.paperDetail}>{entry.detail}</p>}
      </div>)}
    </section>) : <div className={styles.paperEmpty}>Your story starts here.<br /><span>Add a summary, experience, or skills to see your resume take shape.</span></div>}
  </div>;
}
