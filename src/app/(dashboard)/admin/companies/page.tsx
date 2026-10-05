'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

interface CompanyRow {
  id: string;
  company_name: string;
  industry: string | null;
  location: string | null;
  logo_url: string | null;
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
      if (!ctx) {
        reject(new Error('Unable to process this image'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, maxSize, maxSize);

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

export default function AdminCompaniesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteEdited, setPasteEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const selectCompany = useCallback((company: CompanyRow | null) => {
    setSelectedId(company?.id ?? null);
    setPasteUrl(company?.logo_url || '');
    setPasteEdited(false);
    setMessage(null);
  }, []);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/post-job/companies');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load companies');
      }
      const rows = (data.companies || []) as CompanyRow[];
      setCompanies(rows);

      setSelectedId((current) => {
        if (current && rows.some((c) => c.id === current)) return current;
        return rows[0]?.id ?? null;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // loadCompanies only updates state after the asynchronous request completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCompanies();
  }, [loadCompanies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.company_name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.location || '').toLowerCase().includes(q)
    );
  }, [companies, query]);

  const selected = companies.find((c) => c.id === selectedId) || null;

  async function saveLogoUrl(nextUrl: string) {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/companies/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: selected.id, logo_url: nextUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save logo URL');
      }
      const updated = data.company as CompanyRow;
      setCompanies((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      setPasteUrl(updated.logo_url || '');
      setPasteEdited(false);
      setMessage({
        type: 'success',
        text: nextUrl ? 'Logo URL saved.' : 'Logo cleared.',
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save logo URL',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;

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
      const resized = await resizeImage(file, 256);
      const form = new FormData();
      form.set('company_id', selected.id);
      form.set('file', new File([resized], 'logo.png', { type: 'image/png' }));

      const res = await fetch('/api/admin/companies/logo', {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload logo');
      }
      const updated = data.company as CompanyRow;
      setCompanies((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      setPasteUrl(updated.logo_url || '');
      setPasteEdited(false);
      setMessage({ type: 'success', text: 'Logo uploaded and saved.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Upload failed. Please try again.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-display text-primary">Company logos</h1>
        <Link href="/admin/post-job" className="text-sm text-primary underline">
          Post a job
        </Link>
      </div>
      <p className="mb-8 text-sm text-text-light">
        Set or replace logos for any company, including admin-posted placeholders
        like Nobu Barbuda, MOfit, and Woodstock. Uploads use the same{' '}
        <code className="rounded bg-bg-alt px-1">company-logos</code> storage bucket
        as employer profiles.
      </p>

      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`mb-6 rounded-lg border p-4 text-sm ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div role="status" className="animate-pulse space-y-3">
          <span className="sr-only">Loading companies</span>
          <div className="h-10 rounded-lg bg-border" />
          <div className="h-40 rounded-2xl bg-bg-alt border border-border" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p role="alert" className="text-sm text-red-700">
            {loadError}
          </p>
          <button type="button" className="btn-primary mt-4" onClick={loadCompanies}>
            Try again
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-border bg-white p-4 sm:p-5">
            <label htmlFor="company-search" className="block text-sm font-medium text-text">
              Find a company
            </label>
            <input
              id="company-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, id, industry…"
              className="mt-2 block w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <p className="mt-2 text-xs text-text-light">
              {filtered.length} of {companies.length} companies
            </p>
            <ul className="mt-4 max-h-[28rem] space-y-1 overflow-y-auto">
              {filtered.map((company) => {
                const active = company.id === selectedId;
                return (
                  <li key={company.id}>
                    <button
                      type="button"
                      onClick={() => selectCompany(company)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-bg-alt text-text'
                      }`}
                    >
                      {company.logo_url ? (
                        // Public storage URLs; admin may replace before next render.
                        <img
                          src={company.logo_url}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg border border-border bg-white object-contain"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-bg-alt text-sm font-semibold text-primary"
                        >
                          {company.company_name.trim().charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {company.company_name}
                        </span>
                        <span className="block truncate text-xs text-text-light">
                          {[company.industry, company.location].filter(Boolean).join(' · ') ||
                            company.id.slice(0, 8)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-text-light">
                  No companies match that search.
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            {!selected ? (
              <p className="text-sm text-text-light">Select a company to manage its logo.</p>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-text">{selected.company_name}</h2>
                <p className="mt-1 break-all text-xs text-text-light">{selected.id}</p>

                <div className="mt-6 flex items-center gap-4">
                  {selected.logo_url ? (
                    <img
                      src={selected.logo_url}
                      alt={`${selected.company_name} logo`}
                      className="h-20 w-20 rounded-xl border border-border bg-white object-contain"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-bg-alt text-2xl text-primary"
                    >
                      {selected.company_name.trim().charAt(0).toUpperCase() || '?'}
                    </div>
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || saving}
                      className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? 'Uploading…' : 'Upload logo'}
                    </button>
                    <p className="mt-2 text-xs text-text-light">
                      PNG or JPG, up to 5 MB. Resized to a square like employer uploads.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label="Choose company logo"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="mt-8 border-t border-border pt-6">
                  <label htmlFor="logo-url" className="block text-sm font-medium text-text">
                    Or paste a logo URL
                  </label>
                  <input
                    id="logo-url"
                    type="url"
                    value={pasteEdited ? pasteUrl : selected?.logo_url || ''}
                    onChange={(e) => { setPasteEdited(true); setPasteUrl(e.target.value); }}
                    placeholder="https://…"
                    className="mt-2 block w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving || uploading}
                      onClick={() => saveLogoUrl((pasteEdited ? pasteUrl : selected?.logo_url || '').trim())}
                      className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-bg-alt disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save URL'}
                    </button>
                    <button
                      type="button"
                      disabled={saving || uploading || !selected.logo_url}
                      onClick={() => saveLogoUrl('')}
                      className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Clear logo
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
