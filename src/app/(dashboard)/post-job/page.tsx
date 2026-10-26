'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Briefcase01Icon,
  MoneyBag02Icon,
  Tick01Icon,
  File01Icon,
  CircleArrowUpRight02Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import JobCard, { type Job } from '@/components/JobCard';
import {
  INDUSTRIES,
  JOB_TYPE_LABELS,
  type JobType,
  type SalaryType,
} from '@/lib/types';

interface FormData {
  title: string;
  description: string;
  category: string;
  location: string;
  job_type: JobType;
  salary_min: string;
  salary_max: string;
  salary_type: SalaryType;
  salary_visible: boolean;
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
  'block w-full rounded-xl border bg-white px-4 py-3 text-md outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-text-muted/60';

const labelBase = 'block text-base font-medium text-text mb-1.5';

const DESCRIPTION_MAX = 6000;
/** Below this the description is still accepted, but the employer gets a nudge. */
const DESCRIPTION_SOFT_MIN = 200;

export default function PostJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [listingGated, setListingGated] = useState(false);
  const [submitLimitReached, setSubmitLimitReached] = useState(false);
  const [isPro, setIsPro] = useState(false);
  /** True while this is the employer's very first job post, so step 3 of onboarding. */
  const [isSetup, setIsSetup] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [previewCreatedAt, setPreviewCreatedAt] = useState(() => new Date().toISOString());
  const [previewFeatured, setPreviewFeatured] = useState(false);
  const [form, setForm] = useState<FormData>({
    title: '',
    description: '',
    category: '',
    // Seeded from the company row in the load effect below.
    location: '',
    job_type: 'full_time',
    salary_min: '',
    salary_max: '',
    salary_type: 'monthly' as SalaryType,
    salary_visible: true,
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

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id, is_pro, company_name, logo_url, industry, location')
        .eq('user_id', user.id)
        .maybeSingle();

      if (companyError) throw companyError;

      if (!company) {
        router.replace('/company-profile');
        return;
      }

      setIsPro(!!company.is_pro);
      if (company.company_name) setCompanyName(company.company_name);
      if (company.logo_url) setCompanyLogo(company.logo_url);

      // The company profile already asked for industry and location. Seed the
      // matching job fields so a new post starts from what we know rather than
      // from a hardcoded town.
      if (!editId) {
        setForm((prev) => ({
          ...prev,
          category: prev.category || company.industry || '',
          location: prev.location || company.location || '',
        }));

        // Company profile shows "Account, Company, First job". Keep that strip
        // alive through step 3, but only for an employer who has no listing yet.
        const { count: listingCount, error: listingCountError } = await supabase
          .from('job_listings')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id);

        if (listingCountError || listingCount === null) throw new Error('Could not count listings');
        setIsSetup(listingCount === 0);

        // Free accounts get one active listing. Check that here rather than at
        // submit: gating after the employer has written a whole job post
        // throws the form away and shows the paywall as a punishment for
        // finishing. Shown before the form, it is just the plan's limit.
        if (!company.is_pro) {
          const { count: activeCount, error: activeCountError } = await supabase
            .from('job_listings')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company.id)
            .eq('status', 'active');

          if (activeCountError || activeCount === null) throw new Error('Could not count active listings');
          if (activeCount >= 1) {
            setListingGated(true);
            setLoading(false);
            return;
          }
        }
      }
      setListingGated(false);

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

        setPreviewCreatedAt(listing.created_at);
        setPreviewFeatured(listing.is_featured ?? false);
        setForm({
          title: listing.title || '',
          description: listing.description || '',
          category: listing.category || '',
          location: listing.location || '',
          job_type: (listing.job_type as JobType) || 'full_time',
          salary_min: listing.salary_min ? String(listing.salary_min) : '',
          salary_max: listing.salary_max ? String(listing.salary_max) : '',
          salary_type: (listing.salary_type as SalaryType) || 'monthly',
          salary_visible: listing.salary_visible ?? true,
        });
      }

      setLoading(false);
    }

    load().catch(() => {
      setLoadError(true);
      setLoading(false);
    });
  }, [editId, router, loadAttempt]);

  useEffect(() => {
    if (!success) return;
    const redirect = setTimeout(() => router.push('/my-listings'), 2000);
    return () => clearTimeout(redirect);
  }, [success, router]);

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
    if (!form.location.trim()) errs.location = 'Location is required';
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
    setSubmitLimitReached(false);

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      // The submit button sits below four cards, so an error message alone can
      // land several screens above the press. Move the caret to it.
      requestAnimationFrame(() =>
        document.getElementById(Object.keys(validationErrors)[0])?.focus()
      );
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

      // The load effect already gated this, so reaching here means a listing
      // went active in another tab while this form was open. Keep the form
      // visible so this race never hides the employer's work.
      if (!editId && !company.is_pro) {
        const { count, error: countError } = await supabase
          .from('job_listings')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id)
          .eq('status', 'active');

        if (countError || count === null) {
          setServerError('We could not check your listing limit. Your entries are still here. Please try again.');
          setSubmitting(false);
          return;
        }

        if (count >= 1) {
          setSubmitLimitReached(true);
          setSubmitting(false);
          return;
        }
      }

      const listingData = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        location: form.location.trim(),
        job_type: form.job_type,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        // Without this the figures above are quoted in no period at all, and
        // seekers read an hourly rate as a monthly salary.
        salary_type: form.salary_type,
        salary_visible: form.salary_visible,
        expires_at: null,
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
        const { error: insertError } = await supabase
          .from('job_listings')
          .insert({
            company_id: company.id,
            ...listingData,
            requires_work_permit: false,
            status: 'pending_approval',
            expires_at: null,
          });

        if (insertError) {
          setServerError(insertError.message);
          setSubmitting(false);
          return;
        }
      }

      setSuccess(true);
    } catch {
      setServerError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // A soft nudge, never a block: a thin description is publishable but weak.
  const descriptionTrimmed = form.description.trim();
  const descriptionTooShort =
    descriptionTrimmed.length > 0 && descriptionTrimmed.length < DESCRIPTION_SOFT_MIN;

  const previewJob: Job = {
    id: editId ?? 'preview',
    title: form.title.trim() || 'Job title',
    company_name: companyName || 'Your company',
    company_logo: companyLogo,
    location: form.location.trim(),
    job_type: form.job_type,
    salary_min: form.salary_min ? Number(form.salary_min) : null,
    salary_max: form.salary_max ? Number(form.salary_max) : null,
    salary_type: form.salary_type,
    salary_visible: form.salary_visible,
    created_at: previewCreatedAt,
    is_featured: previewFeatured,
    is_pro_company: isPro,
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-sm text-text-muted">Loading listing...</p>
      </div>
    );
  }

  if (loadError) {
    return <div className="mx-auto max-w-3xl py-12">
      <h1 className="text-2xl font-display text-primary">Post a job</h1>
      <p role="alert" className="my-4 text-text-light">We could not load your company and listing details. Check your connection and try again.</p>
      <button type="button" className="btn-primary" onClick={() => { setLoadError(false); setLoading(true); setLoadAttempt((attempt) => attempt + 1); }}>Try again</button>
    </div>;
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
              Upgrade to Pro for unlimited listings
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
          {/* An employer who posts and then cannot find their job assumes it
              failed. Say how long review takes and how they will hear back. */}
          {!editId && (
            <p className="mt-2 text-sm text-text-muted">
              Usually reviewed within one business day. You will get an email
              when it goes live.
            </p>
          )}
          <button
            type="button"
            onClick={() => router.push('/my-listings')}
            className="mt-6 rounded-button bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Go to my listings
          </button>
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
        {isSetup && (
          <ol
            aria-label="Employer setup progress"
            className="mb-6 flex items-center gap-3 text-xs sm:text-sm text-text-light"
          >
            <li className="text-primary">✓ Account</li>
            <li aria-hidden="true" className="h-px flex-1 bg-border" />
            <li className="text-primary">✓ Company</li>
            <li aria-hidden="true" className="h-px flex-1 bg-border" />
            <li aria-current="step" className="font-semibold text-primary">
              3. First job
            </li>
          </ol>
        )}
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
          role="alert"
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
          className="onboarding-form space-y-6 lg:col-span-3"
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
                <label htmlFor="title" className={labelBase}>
                  Job title <span className="text-red-500">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder="e.g. Front Desk Manager"
                  aria-invalid={!!errors.title}
                  aria-describedby={errors.title ? 'title-error' : undefined}
                  className={cn(
                    inputBase,
                    errors.title ? 'border-red-300 bg-red-50/50' : 'border-border/60'
                  )}
                />
                {errors.title && (
                  <p id="title-error" className="mt-1.5 text-xs text-red-600">{errors.title}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className={labelBase}>
                  Job description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  rows={8}
                  maxLength={DESCRIPTION_MAX}
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Describe the role, responsibilities, requirements, and benefits..."
                  aria-invalid={!!errors.description}
                  aria-describedby={cn(
                    errors.description ? 'description-error' : 'description-hint',
                    'description-count'
                  )}
                  className={cn(
                    inputBase,
                    'resize-none',
                    errors.description
                      ? 'border-red-300 bg-red-50/50'
                      : 'border-border/60'
                  )}
                />
                <div className="mt-1.5 flex items-start justify-between gap-4">
                  <p id="description-hint" className="text-xs text-text-muted">
                    Leave application cutoffs out of the public description. Listings stay up until manually closed.
                  </p>
                  <p
                    id="description-count"
                    aria-live="polite"
                    className={cn(
                      'shrink-0 text-xs tabular-nums',
                      form.description.length >= DESCRIPTION_MAX
                        ? 'text-amber-700'
                        : 'text-text-muted'
                    )}
                  >
                    {form.description.length} / {DESCRIPTION_MAX}
                  </p>
                </div>
                {descriptionTooShort && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    A short description gets fewer good applicants. Try to cover what the person
                    will do day to day, what they need to have, and the hours.
                  </p>
                )}
                {errors.description && (
                  <p id="description-error" className="mt-1.5 text-xs text-red-600">
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
              <h2 className="text-sm font-semibold text-text">Category & Location</h2>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="category" className={labelBase}>
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  id="category"
                  value={form.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  aria-invalid={!!errors.category}
                  aria-describedby={errors.category ? 'category-error' : undefined}
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
                  <p id="category-error" className="mt-1.5 text-xs text-red-600">{errors.category}</p>
                )}
              </div>

              <div>
                <label htmlFor="location" className={labelBase}>
                  Location <span className="text-red-500">*</span>
                </label>
                <input
                  id="location"
                  type="text"
                  list="location-suggestions"
                  value={form.location}
                  onChange={(e) => updateField('location', e.target.value)}
                  placeholder="e.g. St. John's, Antigua"
                  aria-invalid={!!errors.location}
                  aria-describedby={errors.location ? 'location-error' : 'location-hint'}
                  className={cn(
                    inputBase,
                    errors.location
                      ? 'border-red-300 bg-red-50/50'
                      : 'border-border/60'
                  )}
                />
                <datalist id="location-suggestions">
                  <option value="St. John's, Antigua" />
                  <option value="English Harbour, Antigua" />
                  <option value="Jolly Harbour, Antigua" />
                  <option value="Hodges Bay, Antigua" />
                  <option value="Falmouth Harbour, Antigua" />
                  <option value="All Saints, Antigua" />
                  <option value="Liberta, Antigua" />
                  <option value="Parham, Antigua" />
                  <option value="Bolans, Antigua" />
                  <option value="Codrington, Barbuda" />
                  <option value="Remote — Antigua and Barbuda" />
                </datalist>
                {errors.location ? (
                  <p id="location-error" className="mt-1.5 text-xs text-red-600">{errors.location}</p>
                ) : (
                  <p id="location-hint" className="mt-1.5 text-[11px] text-text-muted">
                    Required for Google Jobs visibility
                  </p>
                )}
              </div>
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
              <fieldset>
                <legend className={labelBase}>Pay period</legend>
                <div className="flex gap-2">
                  {([
                    { value: 'hourly' as SalaryType, label: 'Hourly' },
                    { value: 'weekly' as SalaryType, label: 'Weekly' },
                    { value: 'biweekly' as SalaryType, label: 'Bi-Weekly' },
                    { value: 'monthly' as SalaryType, label: 'Monthly' },
                    { value: 'annually' as SalaryType, label: 'Annually' },
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
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="salary_min" className={labelBase}>
                    {{ hourly: 'Minimum rate (XCD per hour)', weekly: 'Minimum pay (XCD per week)', biweekly: 'Minimum pay (XCD per two weeks)', monthly: 'Minimum salary (XCD per month)', annually: 'Minimum salary (XCD per year)' }[form.salary_type]}{' '}
                    <span className="font-normal text-text-light">(optional)</span>
                  </label>
                  <input
                    id="salary_min"
                    type="text"
                    inputMode="numeric"
                    placeholder={{ hourly: 'e.g. 25', weekly: 'e.g. 500', biweekly: 'e.g. 1000', monthly: 'e.g. 2000', annually: 'e.g. 24000' }[form.salary_type]}
                    value={form.salary_min}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      updateField('salary_min', v);
                    }}
                    aria-invalid={!!errors.salary_min}
                    aria-describedby={errors.salary_min ? 'salary-min-error' : undefined}
                    className={cn(
                      inputBase,
                      errors.salary_min
                        ? 'border-red-300 bg-red-50/50'
                        : 'border-border/60'
                    )}
                  />
                  {errors.salary_min && (
                    <p id="salary-min-error" className="mt-1.5 text-xs text-red-600">
                      {errors.salary_min}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="salary_max" className={labelBase}>
                    {{ hourly: 'Maximum rate (XCD per hour)', weekly: 'Maximum pay (XCD per week)', biweekly: 'Maximum pay (XCD per two weeks)', monthly: 'Maximum salary (XCD per month)', annually: 'Maximum salary (XCD per year)' }[form.salary_type]}{' '}
                    <span className="font-normal text-text-light">(optional)</span>
                  </label>
                  <input
                    id="salary_max"
                    type="text"
                    inputMode="numeric"
                    placeholder={{ hourly: 'e.g. 50', weekly: 'e.g. 1000', biweekly: 'e.g. 2000', monthly: 'e.g. 5000', annually: 'e.g. 60000' }[form.salary_type]}
                    value={form.salary_max}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      updateField('salary_max', v);
                    }}
                    aria-invalid={!!errors.salary_max}
                    aria-describedby={errors.salary_max ? 'salary-max-error' : undefined}
                    className={cn(
                      inputBase,
                      errors.salary_max
                        ? 'border-red-300 bg-red-50/50'
                        : 'border-border/60'
                    )}
                  />
                  {errors.salary_max && (
                    <p id="salary-max-error" className="mt-1.5 text-xs text-red-600">
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

          <p className="text-sm text-text-muted">Jobs stay active until you close them. No expiry date.</p>

          {/* Submit */}
          <motion.div variants={item}>
            {submitLimitReached && (
              <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p>Your free plan already has an active listing. Your entries are still here. Close that listing or upgrade to Pro, then try again.</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  <a href="/my-listings" target="_blank" rel="noopener noreferrer" className="font-medium underline">Manage your listing (new tab)</a>
                  <a href="/employers/upgrade" target="_blank" rel="noopener noreferrer" className="font-medium underline">Upgrade to Pro (new tab)</a>
                </div>
              </div>
            )}
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

        {/* Shared search result card, with navigation and sharing disabled. */}
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

            <p className="text-[11px] text-text-muted mb-2">This is how your card will appear in job search results.</p>

            <JobCard job={previewJob} preview />

            <p className="mt-3 text-[11px] text-text-muted text-center">
              {editId ? 'Editing listing' : 'Stays active until you close it'}
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
