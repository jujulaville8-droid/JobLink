import { z } from 'zod';
import { INDUSTRIES, JOB_TYPE_LABELS } from '@/lib/types';

export const normalizeKeywords = (keywords: string[]) =>
  [...new Set(keywords.map(word => word.trim().toLowerCase()).filter(Boolean))].sort();

export const alertCriteriaSchema = z.object({
  keywords: z.array(z.string().max(80)).max(10).nullish().transform(words => normalizeKeywords(words || [])),
  industry: z.string().nullish().transform(value => value?.trim() || null)
    .refine(value => !value || INDUSTRIES.includes(value), 'Choose an industry from the list.'),
  job_type: z.string().nullish().transform(value => value?.trim() || null)
    .refine(value => !value || Object.hasOwn(JOB_TYPE_LABELS, value), 'Choose a job type from the list.'),
}).refine(value => value.keywords.length || value.industry || value.job_type, 'Add a keyword, industry, or job type.');

export interface AlertCriteria {
  keywords: string[] | null;
  industry: string | null;
  job_type: string | null;
}
export interface JobAlert extends AlertCriteria { id: string; created_at: string }

export function sameAlert(a: AlertCriteria, b: AlertCriteria) {
  return (a.industry || null) === (b.industry || null) && (a.job_type || null) === (b.job_type || null)
    && JSON.stringify(normalizeKeywords(a.keywords || [])) === JSON.stringify(normalizeKeywords(b.keywords || []));
}
