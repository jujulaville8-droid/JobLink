'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Briefcase01Icon,
  MoneyBag02Icon,
  Clock01Icon,
  Tick01Icon,
  File01Icon,
  CircleArrowUpRight02Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import {
  INDUSTRIES,
  JOB_TYPE_LABELS,
  type JobType,
} from '@/lib/types';

type SalaryType = 'monthly' | 'hourly';

interface FormData {
  title: string;
  description: string;
  category: string;
  job_type: JobType;
  salary_min: string;
  salary_max: string;
  salary_type: SalaryType;
  salary_visible: boolean;
  duration: '30' | '60';
}

interface FormErrors {
  [key: string]: string;
}

const cardBase =
  'rounded-2xl border border-border/40 bg-white overflow-hidden transition-all duration-300';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const },
  },
};

const inputBase =
  'block w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-text-muted/60';

export default function PostJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [listingGated, setListingGated] = useState(false);
  const [form, setForm] = useState<FormData>({
    title: '',
    description: '',
    category: '',
    job_type: 'full_time',
    salary_min: '',
    salary_max: '',
    salary_type: 'monthly' as SalaryType,
    salary_visible: true,
    duration: '30',
  });

  // Load data: check Pro status + active listing count, and load edit data if needed
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setServerError('You must be logged in.');
        setLoading(false);
        return;
      }

      const { data: company } = await supabase
        .from('companies')
        .select('id, is_pro')
        .eq('user_id', user.id)
        .single();

      if (!company) {
        setServerError('Company profile not found.');
        setLoading(false);
        return;
      }

      // For new listings: check if non-Pro employer already has an active listing
      if (!editId && !company.is_pro) {
        const { count } = await supabase
          .from('job_listings')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id)
          .eq('status', 'active');

        if ((count ?? 0) >= 1) {
          setListingGated(true);
          setLoading(false);
          return;
        }
      }

      // Load existing listing if editing
      if (editId) {
        const { data: listing, error } = await supabase
          .from('job_listings')
          .select('*')
          .eq('id', editId)
          .eq('company_id', company.id)
          .in('status', ['pending_approval', 'active'])
          .single();

        if (error || !listing) {
          setServerError('Listing not found or cannot be edited.');
          setLoading(false);
          return;
        }

        setForm({
          title: listing.title || '',
          description: listing.description || '',
          category: listing.category || '',
          job_type: (listing.job_type as JobType) || 'full_time',
          salary_min: listing.salary_min ? String(listing.salary_min) : '',
          salary_max: listing.salary_max ? String(listing.salary_max) : '',
          salary_type: (listing.salary_type as SalaryType) || 'monthly',
          salary_visible: listing.salary_visible ?? true,
          duration: '30',
        });
      }

      setLoading(false);
    }

    load();
  }, [editId]);

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

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id, is_pro')
        .eq('user_id', user.id)
        .single();

      if (companyError || !company) {
        setServerError(
          'Please complete your company profile before posting a job.'
        );
        setSubmitting(false);
        return;
      }

      // Double-check listing limit for non-Pro on new listings
      if (!editId && !company.is_pro) {
        const { count } = await supabase
          .from('job_listings')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id)
          .eq('status', 'active');

        if ((count ?? 0) >= 1) {
          setListingGated(true);
          setSubmitting(false);
          return;
        }
      }

      const listingData = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        job_type: form.job_type,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        salary_type: form.salary_type,
        salary_visible: form.salary_visible,
      };

      if (editId) {
        // Update existing listing (pending or active)
        const { error: updateError } = await supabase
          .from('job_listings')
          .update(listingData)
          .eq('id', editId)
          .eq('company_id', company.id)
          .in('status', ['pending_approval', 'active']);

        if (updateError) {
          setServerError(updateError.message);
          setSubmitting(false);
          return;
        }
      } else {
        // Create new listing
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + Number(form.duration));

        const { error: insertError } = await supabase
          .from('job_listings')
          .insert({
            company_id: company.id,
            ...listingData,
            requires_work_permit: false,
            status: 'pending_approval',
            expires_at: expiresAt.toISOString(),
          });

        if (insertError) {
          setServerError(insertError.message);
          setSubmitting(false);
          return;
        }
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
      n >= 1000 ? `EC$${(n / 1000).toFixed(0)}k` : `EC$${n}`;
    if (min && max) return `${fmt(Number(min))} - ${fmt(Number(max))}`;
    if (min) return `From ${fmt(Number(min))}`;
    return `Up to ${fmt(Number(max))}`;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-sm text-text-muted">Loading listing...</p>
      </div>
    );
  }

  if (listingGated) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-2xl border border-border bg-white p-10 shadow-lg">
          {/* Usage indicator */}
          <div className="mx-auto mb-6 flex items-center justify-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
              Free plan limit reached
            </span>
          </div>

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
            <svg className="h-7 w-7 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <h2 className="mt-6 text-xl font-bold font-display text-text">
            You&apos;ve used your free listing
          </h2>
          <p className="mt-2 text-sm text-text-light leading-relaxed">
            Free accounts include <span className="font-semibold text-text">1 active listing</span>. You&apos;re currently using it. Upgrade to JobLink Pro to post unlimited listings and get featured placement.
          </p>

          {/* Usage bar */}
          <div className="mt-6 mx-auto max-w-xs">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-text-muted">Active listings</span>
              <span className="font-semibold text-text">1 / 1 used</span>
            </div>
            <div className="h-2 w-full rounded-full bg-bg-alt overflow-hidden">
              <div className="h-full w-full rounded-full bg-amber-400" />
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/employers/upgrade"
              className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Upgrade to Pro — Unlimited Listings
            </a>
            <a
              href="/my-listings"
              className="rounded-xl border border-border px-6 py-3 text-sm font-medium text-text transition-colors hover:bg-bg-alt"
            >
              Manage Your Listing
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto max-w-lg px-4 py-16"
      >
        <div className={cn(cardBase, 'p-10 text-center')}>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5, delay: 0.1 }}
            className="mx-auto w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center"
          >
            <HugeiconsIcon icon={Tick01Icon} size={32} className="text-emerald-500" />
          </motion.div>
          <h2 className="mt-5 text-xl font-bold font-display text-text">
            {editId ? 'Listing Updated!' : 'Job Submitted Successfully!'}
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            {editId
              ? 'Your changes have been saved and are live.'
              : "Your job listing has been submitted for review. You'll be redirected to your listings shortly."}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-5xl"
    >
      {/* Header */}
      <motion.div variants={item} className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center">
            <HugeiconsIcon icon={Briefcase01Icon} size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-text sm:text-3xl">
              {editId ? 'Edit Listing' : 'Post a Job'}
            </h1>
            <p className="text-sm text-text-muted">
              {editId
                ? 'Update your listing details.'
                : 'Fill out the details below to submit your listing for review.'}
            </p>
          </div>
        </div>
      </motion.div>

      {serverError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {serverError}
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 lg:col-span-3"
          noValidate
        >
          {/* Job Details Card */}
          <motion.div variants={item} className={cn(cardBase, 'p-6')}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center">
                <HugeiconsIcon icon={File01Icon} size={16} className="text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-text">Job Details</h2>
            </div>

            <div className="space-y-5">
              {/* Title */}
              <div>
                <label
                  htmlFor="title"
                  className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2"
                >
                  Job Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder="e.g. Front Desk Manager"
                  className={cn(
                    inputBase,
                    errors.title ? 'border-red-300 bg-red-50/50' : 'border-border/60'
                  )}
                />
                {errors.title && (
                  <p className="mt-1.5 text-xs text-red-600">{errors.title}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2"
                >
                  Job Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  rows={8}
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Describe the role, responsibilities, requirements, and benefits..."
                  className={cn(
                    inputBase,
                    'resize-none',
                    errors.description
                      ? 'border-red-300 bg-red-50/50'
                      : 'border-border/60'
                  )}
                />
                {errors.description && (
                  <p className="mt-1.5 text-xs text-red-600">
                    {errors.description}
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Category & Location Card */}
          <motion.div variants={item} className={cn(cardBase, 'p-6')}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <HugeiconsIcon icon={Briefcase01Icon} size={16} className="text-blue-600" />
              </div>
              <h2 className="text-sm font-semibold text-text">Category</h2>
            </div>

            <div>
              <label
                htmlFor="category"
                className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2"
              >
                Category <span className="text-red-500">*</span>
              </label>
              <select
                id="category"
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                className={cn(
                  inputBase,
                  errors.category
                    ? 'border-red-300 bg-red-50/50'
                    : 'border-border/60'
                )}
              >
                <option value="">Select category</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1.5 text-xs text-red-600">{errors.category}</p>
              )}
            </div>
          </motion.div>

          {/* Job Type Card */}
          <motion.div variants={item} className={cn(cardBase, 'p-6')}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <HugeiconsIcon icon={Briefcase01Icon} size={16} className="text-emerald-600" />
              </div>
              <h2 className="text-sm font-semibold text-text">Job Type</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                Object.entries(JOB_TYPE_LABELS) as [JobType, string][]
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    'cursor-pointer rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                    form.job_type === value
                      ? 'border-primary bg-primary/5 text-primary shadow-sm shadow-primary/10'
                      : 'border-border/60 text-text-muted hover:border-primary/30 hover:text-text'
                  )}
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
          </motion.div>

          {/* Salary Card */}
          <motion.div variants={item} className={cn(cardBase, 'p-6')}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <HugeiconsIcon icon={MoneyBag02Icon} size={16} className="text-amber-600" />
              </div>
              <h2 className="text-sm font-semibold text-text">Compensation</h2>
            </div>

            <div className="space-y-5">
              {/* Pay type toggle */}
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Pay Type
                </label>
                <div className="flex gap-2">
                  {([
                    { value: 'monthly' as SalaryType, label: 'Monthly' },
                    { value: 'hourly' as SalaryType, label: 'Hourly' },
                  ]).map(({ value, label }) => (
                    <label
                      key={value}
                      className={cn(
                        'cursor-pointer rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                        form.salary_type === value
                          ? 'border-primary bg-primary/5 text-primary shadow-sm shadow-primary/10'
                          : 'border-border/60 text-text-muted hover:border-primary/30 hover:text-text'
                      )}
                    >
                      <input
                        type="radio"
                        name="salary_type"
                        value={value}
                        checked={form.salary_type === value}
                        onChange={() => updateField('salary_type', value)}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    {form.salary_type === 'hourly' ? 'Min Rate (XCD/hr)' : 'Min Salary (XCD)'}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={form.salary_type === 'hourly' ? 'e.g. 25' : 'e.g. 2000'}
                    value={form.salary_min}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      updateField('salary_min', v);
                    }}
                    className={cn(
                      inputBase,
                      errors.salary_min
                        ? 'border-red-300 bg-red-50/50'
                        : 'border-border/60'
                    )}
                  />
                  {errors.salary_min && (
                    <p className="mt-1.5 text-xs text-red-600">
                      {errors.salary_min}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    {form.salary_type === 'hourly' ? 'Max Rate (XCD/hr)' : 'Max Salary (XCD)'}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={form.salary_type === 'hourly' ? 'e.g. 50' : 'e.g. 5000'}
                    value={form.salary_max}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      updateField('salary_max', v);
                    }}
                    className={cn(
                      inputBase,
                      errors.salary_max
                        ? 'border-red-300 bg-red-50/50'
                        : 'border-border/60'
                    )}
                  />
                  {errors.salary_max && (
                    <p className="mt-1.5 text-xs text-red-600">
                      {errors.salary_max}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={cn(
                    'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200',
                    form.salary_visible
                      ? 'border-primary bg-primary'
                      : 'border-border/60 group-hover:border-primary/40'
                  )}>
                    {form.salary_visible && (
                      <HugeiconsIcon icon={Tick01Icon} size={12} className="text-white" />
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={form.salary_visible}
                    onChange={(e) =>
                      updateField('salary_visible', e.target.checked)
                    }
                    className="sr-only"
                  />
                  <span className="text-sm text-text">
                    Show salary on listing
                  </span>
                </label>

              </div>
            </div>
          </motion.div>

          {/* Duration Card — only show for new listings */}
          {!editId && (
            <motion.div variants={item} className={cn(cardBase, 'p-6')}>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <HugeiconsIcon icon={Clock01Icon} size={16} className="text-purple-600" />
                </div>
                <h2 className="text-sm font-semibold text-text">Listing Duration</h2>
              </div>

              <div className="flex gap-3">
                {(['30', '60'] as const).map((d) => (
                  <label
                    key={d}
                    className={cn(
                      'cursor-pointer rounded-xl border px-6 py-3 text-sm font-medium transition-all duration-200 flex-1 text-center',
                      form.duration === d
                        ? 'border-primary bg-primary/5 text-primary shadow-sm shadow-primary/10'
                        : 'border-border/60 text-text-muted hover:border-primary/30 hover:text-text'
                    )}
                  >
                    <input
                      type="radio"
                      name="duration"
                      value={d}
                      checked={form.duration === d}
                      onChange={() => updateField('duration', d)}
                      className="sr-only"
                    />
                    <span className="text-lg font-bold block">{d}</span>
                    <span className="text-xs">days</span>
                  </label>
                ))}
              </div>
            </motion.div>
          )}

          {/* Submit */}
          <motion.div variants={item}>
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'w-full sm:w-auto rounded-xl px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300',
                'bg-accent hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/20 hover:-translate-y-0.5',
                'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0',
                'flex items-center justify-center gap-2'
              )}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {editId ? 'Saving...' : 'Submitting...'}
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={CircleArrowUpRight02Icon} size={16} />
                  {editId ? 'Save Changes' : 'Submit Job Listing'}
                </>
              )}
            </button>
          </motion.div>
        </form>

        {/* Preview */}
        <div className="lg:col-span-2">
          <motion.div variants={item} className="sticky top-20">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center">
                <HugeiconsIcon icon={ViewIcon} size={16} className="text-primary" />
              </div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Live Preview
              </h2>
            </div>

            <div className={cn(cardBase, 'p-6 hover:shadow-lg hover:shadow-primary/5')}>
              <h3 className="text-lg font-semibold text-text">
                {form.title || 'Job Title'}
              </h3>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-lg bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                  {JOB_TYPE_LABELS[form.job_type]}
                </span>
                {form.category && (
                  <span className="inline-flex items-center rounded-lg bg-bg-alt px-2.5 py-1 text-xs font-medium text-text-muted">
                    {form.category}
                  </span>
                )}
              </div>

              {form.salary_visible &&
                (form.salary_min || form.salary_max) && (
                  <div className="mt-4 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <HugeiconsIcon icon={MoneyBag02Icon} size={14} className="text-emerald-600" />
                    </div>
                    <p className="text-sm font-semibold text-emerald-600">
                      {formatSalaryPreview(form.salary_min, form.salary_max)}
                      <span className="text-emerald-500 font-normal text-xs ml-1">
                        {form.salary_type === 'hourly' ? '/hr' : '/mo'}
                      </span>
                    </p>
                  </div>
                )}

              {form.description && (
                <div className="mt-4 border-t border-border/40 pt-4">
                  <p className="whitespace-pre-wrap text-sm text-text-muted leading-relaxed line-clamp-6">
                    {form.description}
                  </p>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-4">
                <HugeiconsIcon icon={Clock01Icon} size={12} className="text-text-muted" />
                <span className="text-xs text-text-muted">
                  {editId ? 'Editing listing' : `Listing expires after ${form.duration} days`}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
