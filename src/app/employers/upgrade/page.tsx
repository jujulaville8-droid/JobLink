'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const FREE_FEATURES = [
  { text: '1 active listing', included: true },
  { text: 'No candidate browsing', included: false },
  { text: 'Standard listing placement', included: true },
  { text: 'No headhunting', included: false },
];

const PRO_FEATURES = [
  { text: 'Unlimited active listings', included: true },
  { text: 'Full candidate browse access', included: true },
  { text: 'Featured listing placement', included: true },
  { text: 'Headhunt candidates directly', included: true },
];

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function UpgradePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [companyName, setCompanyName] = useState('Your Company');

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data: company } = await supabase
        .from('companies')
        .select('is_pro, company_name')
        .eq('user_id', user.id)
        .single();

      if (company?.is_pro) {
        setIsPro(true);
      }
      if (company?.company_name) {
        setCompanyName(company.company_name);
      }

      setLoading(false);
    }
    load();
  }, []);

  async function handleUpgrade() {
    if (!userId) return;
    setUpgrading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setUpgrading(false);
      }
    } catch {
      setUpgrading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#e8f5f5] dark:from-[#111318] dark:to-[#151d1d]">

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#095355] via-[#0d7377] to-[#14919b] dark:from-[#071f20] dark:via-[#0a3a3c] dark:to-[#0d5052]">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="relative mx-auto max-w-3xl px-4 py-16 sm:py-20 text-center">
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            Your competitors are already headhunting.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/80 max-w-xl mx-auto leading-relaxed">
            While you&apos;re limited to one listing, Pro employers are browsing candidates and filling roles faster. Don&apos;t fall behind.
          </p>
        </div>
      </section>

      {/* ─── Comparison ─── */}
      <section className="mx-auto max-w-3xl px-4 -mt-8 relative z-10">
        <div className="grid sm:grid-cols-2 gap-4 sm:gap-0">
          {/* Free Column */}
          <div className="rounded-2xl sm:rounded-r-none border border-border bg-white dark:bg-[#191d24] p-6 sm:p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Free</h3>
            <div className="mt-3 flex items-baseline gap-0.5">
              <span className="text-3xl font-bold font-display text-text">$0</span>
              <span className="ml-1 text-sm text-text-muted">/ mo</span>
            </div>
            <div className="my-6 border-t border-border" />
            <ul className="space-y-3.5">
              {FREE_FEATURES.map((f) => (
                <li key={f.text} className="flex items-start gap-2.5">
                  {f.included ? (
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  )}
                  <span className={`text-sm ${f.included ? 'text-text' : 'text-text-muted line-through'}`}>
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro Column */}
          <div className="relative rounded-2xl sm:rounded-l-none border-2 border-primary bg-white dark:bg-[#191d24] p-6 sm:p-8 shadow-lg shadow-primary/10 dark:shadow-primary/5">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white dark:text-[#111318] shadow-md">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Most Popular
              </span>
            </div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Pro</h3>
            <div className="mt-3">
              <div className="flex items-baseline gap-0.5">
                <span className="text-lg font-semibold text-text-muted leading-none translate-y-0.5">$</span>
                <span className="text-3xl font-bold font-display text-text">35.89</span>
                <span className="ml-1 text-sm text-text-muted">USD / mo</span>
              </div>
              <p className="mt-1 text-xs text-text-muted">Billed as EC$97</p>
            </div>
            <div className="my-6 border-t border-primary/20" />
            <ul className="space-y-3.5">
              {PRO_FEATURES.map((f) => (
                <li key={f.text} className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-sm font-medium text-text">{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Pricing CTA Card ─── */}
      <section className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border border-primary/20 dark:border-primary/30 p-8 shadow-lg sm:p-10 bg-gradient-to-br from-[#f0fafa] via-[#e0f4f4] to-[#d5efef] dark:from-[#141f1f] dark:via-[#162525] dark:to-[#182a2a]">
          {/* Badge */}
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 dark:bg-primary/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              JobLink Pro
            </span>
          </div>

          {/* Price */}
          <div className="mt-6 text-center">
            <div className="flex items-baseline justify-center gap-0.5">
              <span className="text-2xl font-semibold text-text-muted leading-none translate-y-1">$</span>
              <span className="text-5xl font-bold font-display text-text leading-none">35.89</span>
              <span className="ml-1.5 text-base text-text-muted">USD / mo</span>
            </div>
            <p className="mt-1.5 text-sm text-text-muted">Billed as EC$97 &middot; Cancel anytime.</p>
          </div>

          <div className="my-8 border-t border-primary/15 dark:border-primary/25" />

          {/* Features */}
          <ul className="space-y-4">
            {PRO_FEATURES.map((f) => (
              <li key={f.text} className="flex items-start gap-3">
                <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <span className="text-sm text-text">{f.text}</span>
              </li>
            ))}
          </ul>

          <div className="my-8 border-t border-primary/15 dark:border-primary/25" />

          {/* CTA */}
          {isPro ? (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-6 py-4 text-center">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                You&apos;re already a Pro member
              </p>
              <a
                href="/dashboard"
                className="mt-1 inline-block text-sm text-emerald-600 dark:text-emerald-500 underline underline-offset-2 hover:text-emerald-800 dark:hover:text-emerald-300"
              >
                Back to dashboard
              </a>
            </div>
          ) : (
            <>
              <p className="mb-4 text-center text-xs text-text-muted">
                Featured listings get significantly more applicant views
              </p>
              <button
                onClick={handleUpgrade}
                disabled={upgrading || !userId}
                className="w-full rounded-xl bg-accent px-6 py-4 text-base font-semibold text-white dark:text-[#111318] transition-all duration-300 hover:bg-accent-hover hover:shadow-xl hover:shadow-accent/25 hover:-translate-y-1 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
              >
                {upgrading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 dark:border-[#111318]/30 border-t-white dark:border-t-[#111318] " />
                    Redirecting to checkout...
                  </span>
                ) : (
                  'Upgrade to Pro'
                )}
              </button>
              <p className="mt-5 text-center text-xs text-text-muted">
                Join employers across Antigua &amp; Barbuda who are hiring smarter
              </p>
            </>
          )}
        </div>
      </section>

      {/* ─── Featured Badge Preview ─── */}
      {!isPro && (
        <section className="mx-auto max-w-lg px-4 pb-20">
          <p className="mb-4 text-center text-sm font-medium text-text-muted">
            This is how your listings will appear to job seekers
          </p>
          <div className="rounded-[--radius-card] border border-border bg-white dark:bg-[#191d24] p-5 shadow-sm">
            <div className="flex items-start gap-3.5">
              <div className="shrink-0 h-11 w-11 rounded-xl bg-primary flex items-center justify-center text-white dark:text-[#111318] font-semibold text-sm">
                {companyName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-text text-[14px] leading-snug">
                    Front Desk Manager
                  </h3>
                  <span className="shrink-0 bg-amber-400 text-amber-950 text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full tracking-wider shadow-sm">
                    Featured
                  </span>
                </div>
                <p className="text-text-muted text-[13px] mt-0.5">{companyName}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <span className="flex items-center gap-1 text-xs text-text-light">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    St. John&apos;s, Antigua
                  </span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    Full Time
                  </span>
                </div>
                <p className="text-[13px] font-semibold text-text mt-2.5">
                  EC$3k &ndash; EC$5k
                  <span className="text-text-muted font-normal text-[11px] ml-1">/mo</span>
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
