'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { INDUSTRIES } from '@/lib/types';

interface CompanyForm {
  company_name: string;
  industry: string;
  location: string;
  description: string;
  website: string;
  logo_url: string;
  is_verified: boolean;
  is_pro: boolean;
}

export default function CompanyProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isSetup, setIsSetup] = useState(true);
  const [form, setForm] = useState<CompanyForm>({
    company_name: '',
    industry: '',
    location: '',
    description: '',
    website: '',
    logo_url: '',
    is_verified: false,
    is_pro: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/employer/login');
        return;
      }

      const { data: company, error } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) throw error;

      if (company) {
        setIsSetup(false);
        setCompanyId(company.id);
        setForm({
          company_name: company.company_name ?? '',
          industry: company.industry ?? '',
          location: company.location ?? '',
          description: company.description ?? '',
          website: company.website ?? '',
          logo_url: company.logo_url ?? '',
          is_verified: company.is_verified ?? false,
          is_pro: company.is_pro ?? false,
        });
      }
      setLoading(false);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [router, loadAttempt]);

  function updateField(key: keyof CompanyForm, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!form.company_name.trim())
      errs.company_name = 'Company name is required';
    try { normalizedWebsite(); } catch {
      errs.website = 'Enter a website such as www.example.com, or leave this blank.';
    }
    return errs;
  }

  function normalizedWebsite() {
    const value = form.website.trim();
    if (!value) return '';
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) {
      throw new Error('Invalid website');
    }
    return url.href;
  }

  function resizeImage(file: File, maxSize: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Unable to process this image')); return; }

        // White background for transparency
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, maxSize, maxSize);

        // Keep the entire logo visible, including wide wordmarks.
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        const width = img.width * scale;
        const height = img.height * scale;
        ctx.drawImage(img, (maxSize - width) / 2, (maxSize - height) / 2, width, height);

        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Failed to process image'))),
          'image/png',
          1
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      img.src = url;
    });
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please upload an image file.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be under 5MB.' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Session expired');

      // Resize to 256x256 square PNG for consistent display
      const resized = await resizeImage(file, 256);
      const fileName = `${user.id}/${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, resized, {
          upsert: true,
          contentType: 'image/png',
        });

      if (uploadError) {
        setMessage({ type: 'error', text: 'Failed to upload logo.' });
        setUploading(false);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('company-logos').getPublicUrl(fileName);

      updateField('logo_url', publicUrl);
      setMessage({ type: 'success', text: 'Logo ready. Save your profile to keep this change.' });
    } catch {
      setMessage({ type: 'error', text: 'Upload failed. Please try again.' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || uploading) return;
    setMessage(null);

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      if (validationErrors.website) setDetailsOpen(true);
      requestAnimationFrame(() => document.getElementById(Object.keys(validationErrors)[0])?.focus());
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage({ type: 'error', text: 'You must be logged in.' });
        setSaving(false);
        return;
      }

      const payload = {
        user_id: user.id,
        company_name: form.company_name.trim(),
        industry: form.industry,
        location: form.location,
        description: form.description.trim(),
        website: normalizedWebsite(),
        logo_url: form.logo_url,
      };

      if (companyId) {
        // Update existing
        const { error } = await supabase
          .from('companies')
          .update(payload)
          .eq('id', companyId)
          .eq('user_id', user.id)
          .select('id')
          .single();

        if (error) {
          setMessage({ type: 'error', text: 'Your profile could not be saved. Your details are still here — please try again.' });
          setSaving(false);
          return;
        }
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('companies')
          .insert(payload)
          .select('id')
          .single();

        if (error) {
          setMessage({ type: 'error', text: 'Your profile could not be saved. Your details are still here — please try again.' });
          setSaving(false);
          return;
        }

        setCompanyId(data.id);
      }

      setMessage({ type: 'success', text: 'Company profile saved successfully!' });
      if (isSetup) router.push('/post-job');
    } catch {
      setMessage({ type: 'error', text: 'We could not save your profile. Your details are still here — please try again.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div role="status" className="mx-auto max-w-3xl px-4 py-12">
        <span className="sr-only">Loading company profile</span>
        <div aria-hidden="true" className="animate-pulse space-y-6">
          <div className="h-8 w-2/3 rounded-lg bg-border" />
          <div className="h-4 w-1/2 rounded bg-border" />
          <div className="h-80 rounded-2xl bg-bg-alt border border-border" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-display text-primary">Company profile</h1>
      <p role="alert" className="my-4 text-text-light">We couldn&apos;t load your company details. Please check your connection and try again.</p>
      <button type="button" className="btn-primary" onClick={() => { setLoadError(false); setLoading(true); setLoadAttempt((value) => value + 1); }}>Try again</button>
    </div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {isSetup && <ol aria-label="Employer setup progress" className="mb-8 flex items-center gap-3 text-xs sm:text-sm text-text-light">
        <li className="text-primary">✓ Account</li>
        <li aria-hidden="true" className="h-px flex-1 bg-border" />
        <li aria-current="step" className="font-semibold text-primary">2. Company</li>
        <li aria-hidden="true" className="h-px flex-1 bg-border" />
        <li>3. First job</li>
      </ol>}
      <h1 className="text-2xl font-bold font-display text-primary sm:text-3xl">
        {isSetup ? 'Tell us about your company' : 'Company profile'}
      </h1>
      <p className="mt-2 text-sm text-text-light">
        {isSetup ? 'Start with your company name. Everything else is optional and can be added later.' : 'Help candidates get to know your organization. You can update these details anytime.'}
      </p>

      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`mt-4 rounded-lg border p-4 text-sm ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Badges */}
      {!isSetup && <div className="mt-6 flex flex-wrap gap-3">
        {form.is_verified && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            Verified Company
          </div>
        )}
        {form.is_pro ? (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Pro Member
          </div>
        ) : (
          <a
            href="/employers/upgrade"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-amber-500/25 transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/30 hover:-translate-y-0.5 active:translate-y-0"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Upgrade to Pro
          </a>
        )}
      </div>}

      <form onSubmit={handleSubmit} className="onboarding-form mt-8 rounded-2xl border border-border bg-white p-5 sm:p-8" noValidate aria-busy={saving}>
        <fieldset disabled={saving} className="space-y-6">
        {/* Company Name */}
        <div>
          <label
            htmlFor="company_name"
            className="block text-sm font-medium text-text"
          >
            Company Name <span className="text-red-500">*</span>
          </label>
          <input
            id="company_name"
            type="text"
            autoComplete="organization"
            required
            aria-invalid={!!errors.company_name}
            aria-describedby={errors.company_name ? 'company-name-error' : undefined}
            value={form.company_name}
            onChange={(e) => updateField('company_name', e.target.value)}
            placeholder="e.g. Caribbean Solutions Ltd."
            className={`mt-1 block w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
              errors.company_name
                ? 'border-red-400 bg-red-50'
                : 'border-border'
            }`}
          />
          {errors.company_name && (
            <p id="company-name-error" className="mt-1 text-xs text-red-600">{errors.company_name}</p>
          )}
        </div>

        {/* Industry + Location */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="industry"
              className="block text-sm font-medium text-text"
            >
              Industry <span className="font-normal text-text-light">(optional)</span>
            </label>
            <select
              id="industry"
              value={form.industry}
              onChange={(e) => updateField('industry', e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="">Select industry</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="comp_location"
              className="block text-sm font-medium text-text"
            >
              Location <span className="font-normal text-text-light">(optional)</span>
            </label>
            <input
              id="comp_location"
              type="text"
              autoComplete="address-level2"
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
              placeholder="e.g. St. John's, Antigua"
              className="mt-1 block w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <details open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)} className="border-t border-border pt-5">
          <summary className="cursor-pointer py-2 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Logo and more details <span className="font-normal text-text-light">(optional)</span></summary>
          <div className="mt-5 space-y-6">
            <div>
              <p className="text-sm font-medium text-text">Company logo</p>
              <div className="mt-2 flex items-center gap-4">
                {form.logo_url ? (
                  // Uploaded logos use public storage URLs and may be changed before saving.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logo_url} alt="Company logo preview" className="h-16 w-16 rounded-xl border border-border object-contain" />
                ) : <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-bg-alt text-xl text-primary">{form.company_name.trim().charAt(0).toUpperCase() || '+'}</div>}
                <div>
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || saving} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-bg-alt disabled:opacity-50">{uploading ? 'Uploading…' : 'Upload logo'}</button>
                  <p className="mt-1 text-xs text-text-light">PNG or JPG, up to 5 MB. Your full logo stays visible.</p>
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" aria-label="Choose company logo" onChange={handleLogoUpload} className="hidden" />
                </div>
              </div>
            </div>

        {/* Description */}
        <div>
          <label
            htmlFor="comp_description"
            className="block text-sm font-medium text-text"
          >
            About your company (optional)
          </label>
          <textarea
            id="comp_description"
            rows={5}
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Tell job seekers about your company, culture, and what makes you a great employer..."
            className="mt-1 block w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Website */}
        <div>
          <label
            htmlFor="website"
            className="block text-sm font-medium text-text"
          >
            Website (optional)
          </label>
          <input
            id="website"
            type="url"
            autoComplete="url"
            aria-invalid={!!errors.website}
            aria-describedby={errors.website ? 'website-error' : undefined}
            value={form.website}
            onChange={(e) => updateField('website', e.target.value)}
            placeholder="www.example.com"
            className={`mt-1 block w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
              errors.website ? 'border-red-400 bg-red-50' : 'border-border'
            }`}
          />
          {errors.website && (
            <p id="website-error" className="mt-1 text-xs text-red-600">{errors.website}</p>
          )}
        </div>
          </div>
        </details>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || uploading}
          className="w-full rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto"
        >
          {saving ? 'Saving…' : uploading ? 'Waiting for logo…' : isSetup ? 'Save and continue' : 'Save Profile'}
        </button>
        {isSetup && <p className="text-xs text-text-light">Next: write your first job post. Nothing is published at this step.</p>}
        </fieldset>
      </form>
    </div>
  );
}
