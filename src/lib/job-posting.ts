import { z } from 'zod';
import { JOB_TYPE_LABELS, SALARY_TYPE_PERIOD } from './types';

export const BENEFITS = ['Health insurance', 'Meals on duty', 'Transport allowance', 'Staff accommodation', 'Flexible hours', 'Training and development', 'Staff discounts', 'Uniform provided', 'Service charge sharing'] as const;
export const STEPS = ['Basics', 'Pay and benefits', 'Describe the job', 'Hiring details', 'Review'] as const;
const salary = z.string().refine(v => v === '' || (/^\d+$/.test(v) && Number(v) <= 2147483647), 'Enter a valid, non-negative salary');
export const postingSchema = z.object({
  title: z.string().max(200), location: z.string().max(200), location_type: z.enum(['On site', 'Hybrid', 'Remote']),
  category: z.string().max(200), description: z.string().max(6000),
  job_type: z.enum(['full_time', 'part_time', 'seasonal', 'contract']),
  salary_min: salary, salary_max: salary, salary_type: z.enum(['hourly', 'weekly', 'biweekly', 'monthly', 'annually']),
  salary_visible: z.boolean(), benefits: z.array(z.string()).max(20),
});
export type PostingForm = z.infer<typeof postingSchema>;
export const EMPTY_POSTING: PostingForm = { title: '', location: '', location_type: 'On site', category: '', description: '', job_type: 'full_time', salary_min: '', salary_max: '', salary_type: 'monthly', salary_visible: true, benefits: [] };
export function postingErrors(form: PostingForm, step?: number): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === undefined || step === 0) {
    if (!form.title.trim()) errors.title = 'Job title is required';
    if (!form.location.trim()) errors.location = 'Location is required';
  }
  if (step === undefined || step === 1) {
    for (const field of ['salary_min', 'salary_max'] as const) if (!salary.safeParse(form[field]).success) errors[field] = 'Enter a valid, non-negative salary';
    if (form.salary_min && form.salary_max && Number(form.salary_min) > Number(form.salary_max)) errors.salary_max = 'Max salary must be greater than min salary';
  }
  if ((step === undefined || step === 2) && !form.description.trim()) errors.description = 'Description is required';
  if ((step === undefined || step === 3) && !form.category.trim()) errors.category = 'Please select a category';
  return errors;
}
export function templateDescription(form: PostingForm): string {
  const pay = form.salary_visible && (form.salary_min || form.salary_max)
    ? `\nPay: ${form.salary_min ? `from EC$${form.salary_min}` : ''}${form.salary_max ? ` up to EC$${form.salary_max}` : ''} ${SALARY_TYPE_PERIOD[form.salary_type]}.` : '';
  return `About the role\nWe are hiring a ${form.title || 'new team member'} in ${form.location || 'Antigua and Barbuda'}. This is a ${JOB_TYPE_LABELS[form.job_type].toLowerCase()} role (${form.location_type.toLowerCase()}).${pay}\n\nResponsibilities\n[Add the main tasks and day-to-day responsibilities.]\n\nRequirements\n[Add the skills and experience needed for this role.]\n\nWorking hours\n[Add the schedule and working arrangements.]${form.benefits.length ? `\n\nBenefits\n${form.benefits.join('\n')}` : ''}`;
}
export function listingFields(form: PostingForm) {
  return { title: form.title.trim(), description: form.description.trim(), category: form.category, location: form.location.trim(), job_type: form.job_type,
    salary_min: form.salary_min ? Number(form.salary_min) : null, salary_max: form.salary_max ? Number(form.salary_max) : null,
    salary_type: form.salary_type, salary_visible: form.salary_visible, benefits: form.benefits, expires_at: null };
}
