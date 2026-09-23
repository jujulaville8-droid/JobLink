import type { CvFull } from '@/lib/types';

export interface ResumeEntry { title: string; subtitle?: string; dates?: string; detail?: string }
export interface ResumeSection { key: string; title: string; entries: ResumeEntry[] }

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function resumeDate(value?: string | null) {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})/.exec(value);
  return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? `${months[Number(match[2]) - 1]} ${match[1]}` : value;
}
const join = (...values: (string | null | undefined)[]) => values.filter(Boolean).join(' · ');
const range = (start: string | null, end: string | null, current = false) => [resumeDate(start), current ? 'Present' : resumeDate(end)].filter(Boolean).join(' – ');

/** One content model for the editor preview and its PDF. Never truncate user content. */
export function resumeSections(cv: CvFull): ResumeSection[] {
  return [
    { key: 'summary', title: 'Summary', entries: cv.profile.summary ? [{ title: '', detail: cv.profile.summary }] : [] },
    { key: 'experiences', title: 'Experience', entries: cv.experiences.map(e => ({ title: e.job_title, subtitle: join(e.company_name, e.location), dates: range(e.start_date, e.end_date, e.is_current), detail: e.description ?? '' })) },
    { key: 'education', title: 'Education', entries: cv.education.map(e => ({ title: join(e.degree, e.field_of_study), subtitle: e.institution, dates: range(e.start_date, e.end_date, e.is_current), detail: e.description ?? '' })) },
    { key: 'skills', title: 'Skills', entries: cv.skills.length ? [{ title: '', detail: cv.skills.map(s => s.name).join(' · ') }] : [] },
    { key: 'certifications', title: 'Certifications', entries: cv.certifications.map(e => ({ title: e.name, subtitle: e.issuing_organization ?? '', dates: join(resumeDate(e.issue_date), e.expiry_date ? `Expires ${resumeDate(e.expiry_date)}` : '') })) },
    { key: 'projects', title: 'Projects', entries: cv.projects.map(e => ({ title: e.title, subtitle: join(e.role, e.url), dates: range(e.start_date, e.end_date), detail: e.description ?? '' })) },
    { key: 'languages', title: 'Languages', entries: cv.languages.map(e => ({ title: e.name, subtitle: e.proficiency })) },
    { key: 'volunteer', title: 'Volunteering', entries: cv.volunteer.map(e => ({ title: e.organization, subtitle: e.role ?? '', dates: range(e.start_date, e.end_date, e.is_current), detail: e.description ?? '' })) },
    { key: 'awards', title: 'Awards', entries: cv.awards.map(e => ({ title: e.title, subtitle: e.issuer ?? '', dates: resumeDate(e.date_received), detail: e.description ?? '' })) },
    { key: 'memberships', title: 'Memberships', entries: cv.memberships.map(e => ({ title: e.organization, subtitle: e.role ?? '', dates: e.year_joined ?? '' })) },
    { key: 'references', title: 'References', entries: cv.references.map(e => ({ title: e.name, subtitle: join(e.title, e.company, e.relationship), detail: join(e.email, e.phone) })) },
  ].filter(section => section.entries.length > 0);
}
