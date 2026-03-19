'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const FEATURES = [
  'Unlimited active job listings',
  'Featured placement on all your listings',
  'Full candidate browse access',
  'Headhunt candidates directly',
];

export default function UpgradePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [isPro, setIsPro] = useState(false);

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
        .select('is_pro')
        .eq('user_id', user.id)
        .single();

      if (company?.is_pro) {
        setIsPro(true);
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
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl border border-border bg-white p-8 shadow-lg sm:p-10">
          {/* Badge */}
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              JobLink Pro
            </span>
          </div>

          {/* Price */}
          <div className="mt-6 text-center">
            <div className="flex items-baseline justify-center gap-0.5">
              <span className="text-2xl font-semibold text-text-muted align-top leading-none translate-y-1">$</span>
              <span className="text-5xl font-bold font-display text-text leading-none">97</span>
              <span className="ml-1.5 text-base text-text-muted">XCD / mo</span>
            </div>
            <p className="mt-2 text-sm text-text-muted">Cancel anytime.</p>
          </div>

          {/* Divider */}
          <div className="my-8 border-t border-border" />

          {/* Features */}
          <ul className="space-y-4">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-sm text-text">{feature}</span>
              </li>
            ))}
          </ul>

          {/* Divider */}
          <div className="my-8 border-t border-border" />

          {/* CTA */}
          {isPro ? (
            <div className="rounded-xl bg-emerald-50 px-6 py-4 text-center">
              <p className="text-sm font-semibold text-emerald-700">
                You&apos;re already a Pro member
              </p>
              <a
                href="/dashboard"
                className="mt-1 inline-block text-sm text-emerald-600 underline underline-offset-2 hover:text-emerald-800"
              >
                Back to dashboard
              </a>
            </div>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={upgrading || !userId}
              className="w-full rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/20 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
            >
              {upgrading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Redirecting to checkout...
                </span>
              ) : (
                'Upgrade to Pro'
              )}
            </button>
          )}

          {/* Social proof */}
          {!isPro && (
            <p className="mt-5 text-center text-xs text-text-muted">
              Trusted by employers across Antigua &amp; Barbuda
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
