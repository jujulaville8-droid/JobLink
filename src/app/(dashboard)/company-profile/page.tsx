'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { INDUSTRIES } from '@/lib/types';

async function handleUpgradeClick(userId: string) {
  const res = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  const data = await res.json();
  if (data.url) {
    window.location.href = data.url;
  }
}

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
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
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
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: company } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user.id)
        .single();

      setUserId(user.id);

      if (company) {
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
    }
    load();
  }, [router]);

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
    if (form.website && !/^https?:\/\/.+/.test(form.website))
      errs.website = 'Please enter a valid URL starting with http:// or https://';
    return errs;
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please upload an image file.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be under 2MB.' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const ext = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        setMessage({ type: 'error', text: 'Failed to upload logo.' });
        setUploading(false);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('company-logos').getPublicUrl(fileName);

      updateField('logo_url', publicUrl);
      setMessage({ type: 'success', text: 'Logo uploaded successfully.' });
    } catch {
      setMessage({ type: 'error', text: 'Upload failed. Please try again.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
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

      // Ensure public.users row exists (trigger may have failed during signup)
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!existingUser) {
        await supabase.from('users').insert({
          id: user.id,
          email: user.email!,
          role: 'employer' as const,
        });
      }

      const payload = {
        user_id: user.id,
        company_name: form.company_name.trim(),
        industry: form.industry,
        location: form.location,
        description: form.description.trim(),
        website: form.website.trim(),
        logo_url: form.logo_url,
      };

      if (companyId) {
        // Update existing
        const { error } = await supabase
          .from('companies')
          .update(payload)
          .eq('id', companyId);

        if (error) {
          setMessage({ type: 'error', text: error.message });
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
          setMessage({ type: 'error', text: error.message });
          setSaving(false);
          return;
        }

        setCompanyId(data.id);
      }

      setMessage({ type: 'success', text: 'Company profile saved successfully!' });
    } catch {
      setMessage({ type: 'error', text: 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold font-display text-primary sm:text-3xl">
        Company Profile
      </h1>
      <p className="mt-2 text-sm text-text-light">
        Set up your company profile so job seekers can learn about your
        organization.
      </p>

      {message && (
        <div
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
      <div className="mt-6 flex flex-wrap gap-3">
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
          <button
            type="button"
            onClick={async () => {
              if (!userId) return;
              setUpgrading(true);
              await handleUpgradeClick(userId);
              setUpgrading(false);
            }}
            disabled={upgrading}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {upgrading ? 'Redirecting...' : 'Upgrade to Pro'}
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
        {/* Logo */}
        <div>
          <label className="block text-sm font-medium text-text">
            Company Logo
          </label>
          <div className="mt-2 flex items-center gap-4">
            {form.logo_url ? (
              <img
                src={form.logo_url}
                alt="Company logo"
                className="h-16 w-16 rounded-lg border border-border object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-border bg-bg-alt text-text-light">
                <svg
                  className="h-8 w-8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
            )}
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg-alt disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </button>
              <p className="mt-1 text-xs text-text-light">
                PNG, JPG up to 2MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>
          </div>
        </div>

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
            <p className="mt-1 text-xs text-red-600">{errors.company_name}</p>
          )}
        </div>

        {/* Industry + Location */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="industry"
              className="block text-sm font-medium text-text"
            >
              Industry
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
              Location
            </label>
            <input
              id="comp_location"
              type="text"
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
              placeholder="e.g. St. John's, Antigua"
              className="mt-1 block w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="comp_description"
            className="block text-sm font-medium text-text"
          >
            Description
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
            Website
          </label>
          <input
            id="website"
            type="url"
            value={form.website}
            onChange={(e) => updateField('website', e.target.value)}
            placeholder="https://www.example.com"
            className={`mt-1 block w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
              errors.website ? 'border-red-400 bg-red-50' : 'border-border'
            }`}
          />
          {errors.website && (
            <p className="mt-1 text-xs text-red-600">{errors.website}</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}
