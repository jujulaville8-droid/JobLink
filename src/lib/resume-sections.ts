import type { CvFull } from '@/lib/types';

export type RecordSection = Exclude<keyof CvFull, 'profile' | 'contact'>;
export type EditorSection = RecordSection | 'profile';
export type EntryDraft = Record<string, string | boolean | number | null>;
export interface ResumeField { key: string; label: string; type?: 'textarea' | 'month' | 'checkbox' | 'email' | 'url'; required?: boolean; placeholder?: string }
export interface SectionDefinition { key: RecordSection; table: string; title: string; singular: string; hint: string; fields: ResumeField[] }
const field = (key: string, label: string, required = false, type?: ResumeField['type']): ResumeField => ({ key, label, required, type });
const dates = [field('start_date', 'Start date', false, 'month'), field('end_date', 'End date', false, 'month')];
const current = field('is_current', 'Currently in this role', false, 'checkbox');
const description = field('description', 'Details and achievements', false, 'textarea');

export const resumeSectionDefinitions: SectionDefinition[] = [
  { key: 'experiences', table: 'cv_work_experiences', title: 'Work experience', singular: 'role', hint: 'Show the impact of your work. Start with your most recent role.', fields: [field('job_title', 'Job title', true), field('company_name', 'Company', true), field('location', 'Location'), field('start_date', 'Start date', true, 'month'), dates[1], current, description] },
  { key: 'education', table: 'cv_education', title: 'Education', singular: 'education', hint: 'Include education, training, or a qualification relevant to your next role.', fields: [field('institution', 'School or institution', true), field('degree', 'Qualification', true), field('field_of_study', 'Field of study'), ...dates, { ...current, label: 'Currently studying here' }, description] },
  { key: 'skills', table: 'cv_skills', title: 'Skills', singular: 'skill', hint: 'Choose specific skills you can confidently bring to the job.', fields: [field('name', 'Skill', true)] },
  { key: 'certifications', table: 'cv_certifications', title: 'Certifications', singular: 'certification', hint: 'Include relevant training, licences, and certificates.', fields: [field('name', 'Certificate name', true), field('issuing_organization', 'Issuing organisation'), field('issue_date', 'Issue date', false, 'month'), field('expiry_date', 'Expiry date', false, 'month')] },
  { key: 'projects', table: 'cv_projects', title: 'Projects', singular: 'project', hint: 'Show practical work, including personal and community projects.', fields: [field('title', 'Project name', true), field('role', 'Your role'), field('url', 'Project link', false, 'url'), ...dates, description] },
  { key: 'languages', table: 'cv_languages', title: 'Languages', singular: 'language', hint: 'Describe your level honestly, such as conversational or fluent.', fields: [field('name', 'Language', true), field('proficiency', 'Proficiency', true)] },
  { key: 'volunteer', table: 'cv_volunteer', title: 'Volunteering', singular: 'volunteer role', hint: 'Community contributions and unpaid experience count too.', fields: [field('organization', 'Organisation', true), field('role', 'Your role'), ...dates, current, description] },
  { key: 'awards', table: 'cv_awards', title: 'Awards', singular: 'award', hint: 'Recognition that helps tell your professional story. This section is optional.', fields: [field('title', 'Award name', true), field('issuer', 'Awarded by'), field('date_received', 'Date received', false, 'month'), description] },
  { key: 'memberships', table: 'cv_memberships', title: 'Memberships', singular: 'membership', hint: 'Professional associations and relevant community groups.', fields: [field('organization', 'Organisation', true), field('role', 'Your role'), field('year_joined', 'Year joined')] },
  { key: 'references', table: 'cv_references', title: 'References', singular: 'reference', hint: 'Optional. Only include someone’s contact details with their permission.', fields: [field('name', 'Name', true), field('title', 'Job title'), field('company', 'Company'), field('relationship', 'Relationship'), field('email', 'Email', false, 'email'), field('phone', 'Phone')] },
];
export const profileFields: ResumeField[] = [field('job_title', 'Professional title'), field('summary', 'Professional summary', false, 'textarea')];

export function validateResumeEntry(section: EditorSection, input: EntryDraft): EntryDraft {
  const fields = section === 'profile' ? profileFields : resumeSectionDefinitions.find(s => s.key === section)?.fields;
  if (!fields) throw new Error('Choose a valid resume section.');
  const result: EntryDraft = {};
  for (const f of fields) {
    const raw = input[f.key];
    if (f.type === 'checkbox') {
      if (raw != null && typeof raw !== 'boolean') throw new Error(`${f.label} must be true or false.`);
      result[f.key] = raw === true;
      continue;
    }
    if (raw != null && typeof raw !== 'string') throw new Error(`${f.label} must be text.`);
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (f.required && !value) throw new Error(`${f.label} is required.`);
    if (value.length > (f.type === 'textarea' ? 10000 : 500)) throw new Error(`${f.label} is too long.`);
    if (f.type === 'month' && value && !/^\d{4}-(0[1-9]|1[0-2])(?:-01)?$/.test(value)) throw new Error(`${f.label} must be a valid month and year.`);
    if (f.type === 'url' && value && !/^https?:\/\//i.test(value)) throw new Error(`${f.label} must start with https:// or http://.`);
    if (f.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${f.label} must be a valid email address.`);
    if (f.key === 'year_joined' && value && !/^\d{4}$/.test(value)) throw new Error('Year joined must have four digits.');
    result[f.key] = value ? f.type === 'month' ? `${value.slice(0, 7)}-01` : value : null;
  }
  if (result.is_current) result.end_date = null;
  if (result.start_date && result.end_date && result.end_date < result.start_date) throw new Error('End date must be after the start date.');
  if (result.issue_date && result.expiry_date && result.expiry_date < result.issue_date) throw new Error('Expiry date must be after the issue date.');
  return result;
}
