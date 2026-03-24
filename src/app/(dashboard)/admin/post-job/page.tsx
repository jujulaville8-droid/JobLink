'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { INDUSTRIES, JOB_TYPE_LABELS, type JobType } from '@/lib/types';

type SalaryType = 'hourly' | 'weekly' | 'biweekly' | 'monthly' | 'annually';

interface CompanyOption {
  id: string;
  company_name: string;
  industry: string | null;
  location: string | null;
}

interface JobFormData {
  title: string;
  description: string;
  category: string;
  job_type: JobType;
  salary_min: string;
  salary_max: string;
  salary_type: SalaryType;
  salary_visible: boolean;
  duration: '7' | '30' | 'unlimited';
}

interface NewCompanyData {
  company_name: string;
  industry: string;
  location: string;
  website: string;
  description: string;
}

const cardBase =
  'rounded-2xl border border-border/40 bg-white overflow-hidden transition-all duration-300';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const } },
};

const inputBase =
  'block w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-text-muted/60';

export default function AdminPostJobPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyMode, setCompanyMode] = useState<'existing' | 'new'>('existing');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companySearch, setCompanySearch] = useState('');

  const [newCompany, setNewCompany] = useState<NewCompanyData>({
    company_name: '',
    industry: '',
    location: '',
    website: '',
    description: '',
  });

  const [form, setForm] = useState<JobFormData>({
    title: '',
    description: '',
    category: '',
    job_type: 'full_time',
    salary_min: '',
    salary_max: '',
    salary_type: 'monthly',
    salary_visible: true,
    duration: '7',
  });

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Fetch all companies for the dropdown
      const res = await fetch('/api/admin/post-job/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  function updateField<K extends keyof JobFormData>(key: K, value: JobFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  function updateNewCompany<K extends keyof NewCompanyData>(key: K, value: string) {
    setNewCompany(prev => ({ ...prev, [key]: value }));
    if (errors[`nc_${key}`]) setErrors(prev => { const n = { ...prev }; delete n[`nc_${key}`]; return n; });
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};

    if (companyMode === 'existing' && !selectedCompanyId) {
      errs.company = 'Please select a company';
    }
    if (companyMode === 'new' && !newCompany.company_name.trim()) {
      errs.nc_company_name = 'Company name is required';
    }

    if (!form.title.trim()) errs.title = 'Job title is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    if (!form.category) errs.category = 'Please select a category';

    if (form.salary_min && form.salary_max) {
      if (Number(form.salary_min) > Number(form.salary_max)) {
        errs.salary_max = 'Max must be greater than min';
      }
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
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        job_type: form.job_type,
        salary_min: form.salary_min || null,
        salary_max: form.salary_max || null,
        salary_visible: form.salary_visible,
        duration: form.duration,
      };

      if (companyMode === 'existing') {
        payload.company_id = selectedCompanyId;
      } else {
        payload.new_company = newCompany;
      }

      const res = await fetch('/api/admin/post-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error || 'Something went wrong.');
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/jobs/${data.listingId}`);
      }, 2000);
    } catch {
      setServerError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  const filteredCompanies = companies.filter(c =>
    c.company_name.toLowerCase().includes(companySearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className={cn(cardBase, 'p-10')}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50">
            <svg className="h-7 w-7 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="mt-6 text-xl font-bold font-display text-text">Job posted successfully!</h2>
          <p className="mt-2 text-sm text-text-light">The listing is now live. Redirecting to the job page...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-2xl space-y-6"
    >
      {/* Header */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold font-display text-text">Post a Job</h1>
        <p className="mt-1 text-sm text-text-muted">
          Post a job on behalf of any company. It goes live immediately.
        </p>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Company Section */}
        <motion.div variants={item} className={cardBase}>
          <div className="px-6 py-5 border-b border-border/40">
            <h2 className="text-sm font-semibold text-text">Company</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            {/* Toggle */}
            <div className="flex rounded-xl border border-border/40 overflow-hidden">
              <button
                type="button"
                onClick={() => { setCompanyMode('existing'); setErrors(e => { const n = { ...e }; delete n.company; return n; }); }}
                className={cn(
                  'flex-1 py-2.5 text-sm font-medium transition-colors',
                  companyMode === 'existing' ? 'bg-primary text-white' : 'bg-white text-text-muted hover:bg-bg-alt'
                )}
              >
                Existing Company
              </button>
              <button
                type="button"
                onClick={() => { setCompanyMode('new'); setErrors(e => { const n = { ...e }; delete n.company; return n; }); }}
                className={cn(
                  'flex-1 py-2.5 text-sm font-medium transition-colors',
                  companyMode === 'new' ? 'bg-primary text-white' : 'bg-white text-text-muted hover:bg-bg-alt'
                )}
              >
                New Company
              </button>
            </div>

            {companyMode === 'existing' ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Search companies..."
                  value={companySearch}
                  onChange={e => setCompanySearch(e.target.value)}
                  className={cn(inputBase, 'border-border/40')}
                />
                {errors.company && <p className="text-xs text-red-500">{errors.company}</p>}
                <div className="max-h-52 overflow-y-auto rounded-xl border border-border/40 divide-y divide-border/30">
                  {filteredCompanies.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-text-muted">No companies found.</p>
                  ) : (
                    filteredCompanies.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setSelectedCompanyId(c.id); setErrors(e => { const n = { ...e }; delete n.company; return n; }); }}
                        className={cn(
                          'w-full text-left px-4 py-3 text-sm transition-colors',
                          selectedCompanyId === c.id
                            ? 'bg-primary/5 text-primary font-medium'
                            : 'hover:bg-bg-alt text-text'
                        )}
                      >
                        <span className="font-medium">{c.company_name}</span>
                        {(c.industry || c.location) && (
                          <span className="ml-2 text-xs text-text-muted">
                            {[c.industry, c.location].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
                {selectedCompanyId && (
                  <p className="text-xs text-green-600 font-medium">
                    ✓ {companies.find(c => c.id === selectedCompanyId)?.company_name} selected
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    placeholder="Company name *"
                    value={newCompany.company_name}
                    onChange={e => updateNewCompany('company_name', e.target.value)}
                    className={cn(inputBase, errors.nc_company_name ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-border/40')}
                  />
                  {errors.nc_company_name && <p className="mt-1 text-xs text-red-500">{errors.nc_company_name}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newCompany.industry}
                    onChange={e => updateNewCompany('industry', e.target.value)}
                    className={cn(inputBase, 'border-border/40')}
                  >
                    <option value="">Industry (optional)</option>
                    {INDUSTRIES.map(ind => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Location (optional)"
                    value={newCompany.location}
                    onChange={e => updateNewCompany('location', e.target.value)}
                    className={cn(inputBase, 'border-border/40')}
                  />
                </div>
                <input
                  type="url"
                  placeholder="Website (optional)"
                  value={newCompany.website}
                  onChange={e => updateNewCompany('website', e.target.value)}
                  className={cn(inputBase, 'border-border/40')}
                />
                <textarea
                  placeholder="Company description (optional)"
                  value={newCompany.description}
                  onChange={e => updateNewCompany('description', e.target.value)}
                  rows={3}
                  className={cn(inputBase, 'border-border/40 resize-none')}
                />
              </div>
            )}
          </div>
        </motion.div>

        {/* Job Details */}
        <motion.div variants={item} className={cardBase}>
          <div className="px-6 py-5 border-b border-border/40">
            <h2 className="text-sm font-semibold text-text">Job Details</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            {/* Title */}
            <div>
              <input
                type="text"
                placeholder="Job title *"
                value={form.title}
                onChange={e => updateField('title', e.target.value)}
                className={cn(inputBase, errors.title ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-border/40')}
              />
              {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
            </div>

            {/* Category + Job Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <select
                  value={form.category}
                  onChange={e => updateField('category', e.target.value)}
                  className={cn(inputBase, errors.category ? 'border-red-400' : 'border-border/40')}
                >
                  <option value="">Category *</option>
                  {INDUSTRIES.map(ind => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
                {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category}</p>}
              </div>
              <select
                value={form.job_type}
                onChange={e => updateField('job_type', e.target.value as JobType)}
                className={cn(inputBase, 'border-border/40')}
              >
                {(Object.entries(JOB_TYPE_LABELS) as [JobType, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <textarea
                placeholder="Job description *"
                value={form.description}
                onChange={e => updateField('description', e.target.value)}
                rows={12}
                className={cn(inputBase, 'resize-y min-h-[200px]', errors.description ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-border/40')}
              />
              <p className="mt-1 text-xs text-text-muted">{form.description.length.toLocaleString()} characters</p>
              {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description}</p>}
            </div>
          </div>
        </motion.div>

        {/* Salary */}
        <motion.div variants={item} className={cardBase}>
          <div className="px-6 py-5 border-b border-border/40">
            <h2 className="text-sm font-semibold text-text">Salary</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                placeholder="Min"
                min={0}
                value={form.salary_min}
                onChange={e => updateField('salary_min', e.target.value)}
                className={cn(inputBase, 'border-border/40')}
              />
              <div>
                <input
                  type="number"
                  placeholder="Max"
                  min={0}
                  value={form.salary_max}
                  onChange={e => updateField('salary_max', e.target.value)}
                  className={cn(inputBase, errors.salary_max ? 'border-red-400' : 'border-border/40')}
                />
                {errors.salary_max && <p className="mt-1 text-xs text-red-500">{errors.salary_max}</p>}
              </div>
              <select
                value={form.salary_type}
                onChange={e => updateField('salary_type', e.target.value as SalaryType)}
                className={cn(inputBase, 'border-border/40')}
              >
                {(['hourly', 'weekly', 'biweekly', 'monthly', 'annually'] as SalaryType[]).map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div
                onClick={() => updateField('salary_visible', !form.salary_visible)}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  form.salary_visible ? 'bg-primary' : 'bg-border'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  form.salary_visible ? 'translate-x-4' : 'translate-x-0'
                )} />
              </div>
              <span className="text-sm text-text-muted">Show salary to applicants</span>
            </label>
          </div>
        </motion.div>

        {/* Duration */}
        <motion.div variants={item} className={cardBase}>
          <div className="px-6 py-5 border-b border-border/40">
            <h2 className="text-sm font-semibold text-text">Listing Duration</h2>
          </div>
          <div className="px-6 py-5">
            <div className="grid grid-cols-3 gap-3">
              {(['7', '30', 'unlimited'] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => updateField('duration', d)}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-sm font-medium transition-all',
                    form.duration === d
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border/40 text-text-muted hover:border-primary/40'
                  )}
                >
                  {d === '7' ? '7 days' : d === '30' ? '30 days' : 'No expiry'}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Error + Submit */}
        {serverError && (
          <motion.div variants={item} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {serverError}
          </motion.div>
        )}

        <motion.div variants={item} className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-border/40 px-5 py-3 text-sm font-medium text-text-muted hover:bg-bg-alt transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Posting...' : 'Post Job — Go Live Now'}
          </button>
        </motion.div>
      </form>
    </motion.div>
  );
}
