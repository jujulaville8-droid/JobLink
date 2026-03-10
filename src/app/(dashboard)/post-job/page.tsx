'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ANTIGUA_PARISHES,
  INDUSTRIES,
  JOB_TYPE_LABELS,
  type JobType,
} from '@/lib/types';

interface FormData {
  title: string;
  description: string;
  category: string;
  job_type: JobType;
  location: string;
  salary_min: string;
  salary_max: string;
  salary_visible: boolean;
  requires_work_permit: boolean;
  duration: '30' | '60';
}

interface FormErrors {
  [key: string]: string;
}

export default function PostJobPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<FormData>({
    title: '',
    description: '',
    category: '',
    job_type: 'full_time',
    location: '',
    salary_min: '',
    salary_max: '',
    salary_visible: true,
    requires_work_permit: false,
    duration: '30',
  });

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!form.title.trim()) errs.title = 'Job title is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    if (!form.category) errs.category = 'Please select a category';
    if (!form.location) errs.location = 'Please select a location';
    if (form.salary_min && form.salary_max) {
      if (Number(form.salary_min) > Number(form.salary_max)) {
        errs.salary_max = 'Max salary must be greater than min salary';
      }
    }
    if (form.salary_min && Number(form.salary_min) < 0) {
      errs.salary_min = 'Salary cannot be negative';
    }
    if (form.salary_max && Number(form.salary_max) < 0) {
      errs.salary_max = 'Salary cannot be negative';
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError('');

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setServerError('You must be logged in to post a job.');
        setSubmitting(false);
        return;
      }

      // Get or verify company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (companyError || !company) {
        setServerError(
          'Please complete your company profile before posting a job.'
        );
        setSubmitting(false);
        return;
      }

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + Number(form.duration));

      const { error: insertError } = await supabase
        .from('job_listings')
        .insert({
          company_id: company.id,
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          job_type: form.job_type,
          location: form.location,
          salary_min: form.salary_min ? Number(form.salary_min) : null,
          salary_max: form.salary_max ? Number(form.salary_max) : null,
          salary_visible: form.salary_visible,
          requires_work_permit: form.requires_work_permit,
          status: 'pending_approval',
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        setServerError(insertError.message);
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/my-listings');
      }, 2000);
    } catch {
      setServerError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function formatSalaryPreview(min: string, max: string): string {
    if (!min && !max) return 'Not specified';
    const fmt = (n: number) =>
      n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
    if (min && max) return `${fmt(Number(min))} - ${fmt(Number(max))}`;
    if (min) return `From ${fmt(Number(min))}`;
    return `Up to ${fmt(Number(max))}`;
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-xl border border-green-200 bg-green-50 p-8">
          <svg
            className="mx-auto h-16 w-16 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="mt-4 text-xl font-bold text-green-800">
            Job Submitted Successfully!
          </h2>
          <p className="mt-2 text-green-700">
            Your job listing has been submitted for review. You will be
            redirected to your listings shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">
        Post a Job
      </h1>
      <p className="mt-2 text-text-light">
        Fill out the form below to submit your job listing for review.
      </p>

      {serverError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 lg:col-span-3"
          noValidate
        >
          {/* Title */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-text"
            >
              Job Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="e.g. Front Desk Manager"
              className={`mt-1 block w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
                errors.title ? 'border-red-400 bg-red-50' : 'border-border'
              }`}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-600">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-text"
            >
              Job Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              rows={8}
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Describe the role, responsibilities, requirements, and benefits..."
              className={`mt-1 block w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
                errors.description
                  ? 'border-red-400 bg-red-50'
                  : 'border-border'
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-600">{errors.description}</p>
            )}
          </div>

          {/* Category + Location row */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="category"
                className="block text-sm font-medium text-text"
              >
                Category <span className="text-red-500">*</span>
              </label>
              <select
                id="category"
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                className={`mt-1 block w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
                  errors.category
                    ? 'border-red-400 bg-red-50'
                    : 'border-border'
                }`}
              >
                <option value="">Select category</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-xs text-red-600">{errors.category}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="location"
                className="block text-sm font-medium text-text"
              >
                Location <span className="text-red-500">*</span>
              </label>
              <select
                id="location"
                value={form.location}
                onChange={(e) => updateField('location', e.target.value)}
                className={`mt-1 block w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
                  errors.location
                    ? 'border-red-400 bg-red-50'
                    : 'border-border'
                }`}
              >
                <option value="">Select parish</option>
                {ANTIGUA_PARISHES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {errors.location && (
                <p className="mt-1 text-xs text-red-600">{errors.location}</p>
              )}
            </div>
          </div>

          {/* Job Type */}
          <div>
            <span className="block text-sm font-medium text-text">
              Job Type
            </span>
            <div className="mt-2 flex flex-wrap gap-3">
              {(
                Object.entries(JOB_TYPE_LABELS) as [JobType, string][]
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    form.job_type === value
                      ? 'border-primary bg-primary text-white'
                      : 'border-border text-text hover:border-primary/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="job_type"
                    value={value}
                    checked={form.job_type === value}
                    onChange={() => updateField('job_type', value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Salary */}
          <div>
            <span className="block text-sm font-medium text-text">
              Salary Range (XCD)
            </span>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div>
                <input
                  type="number"
                  placeholder="Min salary"
                  value={form.salary_min}
                  onChange={(e) => updateField('salary_min', e.target.value)}
                  min={0}
                  className={`block w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
                    errors.salary_min
                      ? 'border-red-400 bg-red-50'
                      : 'border-border'
                  }`}
                />
                {errors.salary_min && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.salary_min}
                  </p>
                )}
              </div>
              <div>
                <input
                  type="number"
                  placeholder="Max salary"
                  value={form.salary_max}
                  onChange={(e) => updateField('salary_max', e.target.value)}
                  min={0}
                  className={`block w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
                    errors.salary_max
                      ? 'border-red-400 bg-red-50'
                      : 'border-border'
                  }`}
                />
                {errors.salary_max && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.salary_max}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.salary_visible}
                onChange={(e) =>
                  updateField('salary_visible', e.target.checked)
                }
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-text">
                Show salary on listing
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_work_permit}
                onChange={(e) =>
                  updateField('requires_work_permit', e.target.checked)
                }
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-text">
                Requires work permit
              </span>
            </label>
          </div>

          {/* Listing Duration */}
          <div>
            <span className="block text-sm font-medium text-text">
              Listing Duration
            </span>
            <div className="mt-2 flex gap-3">
              {(['30', '60'] as const).map((d) => (
                <label
                  key={d}
                  className={`cursor-pointer rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors ${
                    form.duration === d
                      ? 'border-primary bg-primary text-white'
                      : 'border-border text-text hover:border-primary/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="duration"
                    value={d}
                    checked={form.duration === d}
                    onChange={() => updateField('duration', d)}
                    className="sr-only"
                  />
                  {d} days
                </label>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto"
          >
            {submitting ? 'Submitting...' : 'Submit Job Listing'}
          </button>
        </form>

        {/* Preview */}
        <div className="lg:col-span-2">
          <div className="sticky top-20">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-light">
              Preview
            </h2>
            <div className="mt-3 rounded-xl border border-border bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-text">
                {form.title || 'Job Title'}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {form.location && (
                  <span className="flex items-center gap-1 text-xs text-text-light">
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {form.location}
                  </span>
                )}
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {JOB_TYPE_LABELS[form.job_type]}
                </span>
                {form.category && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {form.category}
                  </span>
                )}
              </div>

              {form.salary_visible &&
                (form.salary_min || form.salary_max) && (
                  <p className="mt-3 text-sm font-semibold text-primary">
                    {formatSalaryPreview(form.salary_min, form.salary_max)}
                  </p>
                )}

              {form.requires_work_permit && (
                <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Work Permit Required
                </span>
              )}

              {form.description && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="whitespace-pre-wrap text-sm text-text-light line-clamp-6">
                    {form.description}
                  </p>
                </div>
              )}

              <div className="mt-4 border-t border-border pt-3 text-xs text-text-light">
                Listing expires after {form.duration} days
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
