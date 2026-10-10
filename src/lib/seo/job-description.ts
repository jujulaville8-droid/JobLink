import { publicVacancyDescription } from '@/lib/public-vacancy-description';

interface JobDescriptionInput {
  id?: string | null;
  company_id?: string | null;
  title: string;
  companyName?: string | null;
  location?: string | null;
  description?: string | null;
}

const normalize = (value?: string | null) => (value ?? '').replace(/\s+/g, ' ').trim();

/** Public vacancy text only; Google may choose a different snippet from the page. */
export function jobMetaDescription(job: JobDescriptionInput): string {
  const context = `Apply for ${normalize(job.title)} at ${normalize(job.companyName) || 'a company'} in ${normalize(job.location) || 'Antigua and Barbuda'}.`;
  const description = normalize(publicVacancyDescription(job));
  if (!description) return `${context} View the vacancy and apply on JobLinks.`;

  // An editorial excerpt, not a Google character limit. Keep the full role and
  // employer context even for long titles, and avoid cutting a word or surrogate pair.
  const characters = Array.from(description);
  if (characters.length <= 180) return `${context} ${description}`;
  const candidate = characters.slice(0, 180).join('');
  const boundary = candidate.lastIndexOf(' ');
  const excerpt = boundary > 0 ? candidate.slice(0, boundary) : candidate;
  return `${context} ${excerpt}…`;
}
