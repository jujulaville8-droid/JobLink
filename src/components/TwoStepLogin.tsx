'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Stage =
  | { name: 'loading' }
  | { name: 'done' }
  | { name: 'challenge'; factorId: string }
  | { name: 'enrol'; factorId: string; qr: string; secret: string }
  | { name: 'error'; message: string };

const FRIENDLY_NAME = 'JobLink admin';

/**
 * Admin two-step login with an authenticator app (TOTP).
 *
 * Enrols a first factor, or challenges an existing one, and upgrades this
 * session to AAL2. The server reads the level from the session, never from
 * anything this component says.
 */
export default function TwoStepLogin({ destination }: { destination: string }) {
  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true
    const show = (next: Stage) => { if (live) setStage(next) }
    const supabase = createClient()
    ;(async () => {
      const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (level.data?.currentLevel === 'aal2') return show({ name: 'done' })

      const factors = await supabase.auth.mfa.listFactors()
      if (factors.error) return show({ name: 'error', message: 'Could not load your two-step settings. Refresh and try again.' })
      const verified = factors.data.totp.find((factor) => factor.status === 'verified')
      if (verified) return show({ name: 'challenge', factorId: verified.id })

      // An abandoned enrolment leaves an unverified factor that blocks a new one.
      for (const factor of factors.data.all.filter((item) => item.factor_type === 'totp' && item.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: FRIENDLY_NAME })
      if (enrolled.error || !enrolled.data) {
        return show({ name: 'error', message: 'Could not start two-step setup. Refresh and try again.' })
      }
      show({ name: 'enrol', factorId: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret })
    })().catch(() => show({ name: 'error', message: 'Could not load your two-step settings. Refresh and try again.' }))
    return () => { live = false }
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (stage.name !== 'challenge' && stage.name !== 'enrol') return;
    setBusy(true);
    setError('');
    const supabase = createClient();
    const result = await supabase.auth.mfa.challengeAndVerify({ factorId: stage.factorId, code: code.trim() });
    setBusy(false);
    if (result.error) {
      setCode('');
      return setError('That code did not match. Check the current code in your app and try again.');
    }
    // A full navigation so server components see the upgraded session cookie.
    window.location.assign(destination);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold text-text">Two-step login</h1>
      <p className="mt-2 text-sm text-text-light">
        Admin accounts confirm each sign-in with a 6-digit code from an authenticator app, such as Google Authenticator, Microsoft Authenticator or 1Password.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        {stage.name === 'loading' && <p className="text-sm text-text-light" role="status">Loading…</p>}

        {stage.name === 'error' && <p className="text-sm text-red-600" role="alert">{stage.message}</p>}

        {stage.name === 'done' && (
          <div>
            <p className="text-sm font-semibold text-text">Two-step login is on for this session.</p>
            <a href={destination} className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Continue to admin</a>
          </div>
        )}

        {stage.name === 'enrol' && (
          <ol className="space-y-4 text-sm text-text">
            <li>
              <p className="font-semibold">1. Scan this code with your authenticator app</p>
              {/* Supabase returns the QR code as an SVG data URI. */}
              <img src={stage.qr} alt="QR code for your authenticator app" width={176} height={176} className="mt-3 rounded-lg border border-border bg-white p-2" />
              <p className="mt-3 text-xs text-text-muted">Can&apos;t scan? Enter this key by hand:</p>
              <code className="mt-1 block break-all rounded bg-bg-alt px-2 py-1.5 text-xs">{stage.secret}</code>
            </li>
            <li><p className="font-semibold">2. Enter the 6-digit code it shows</p></li>
          </ol>
        )}

        {stage.name === 'challenge' && (
          <p className="text-sm text-text">Enter the current 6-digit code from your authenticator app.</p>
        )}

        {(stage.name === 'enrol' || stage.name === 'challenge') && (
          <form onSubmit={submit} className="mt-4">
            <label htmlFor="two-step-code" className="sr-only">6-digit code</label>
            <input
              id="two-step-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-center text-lg tracking-[0.4em] text-text"
            />
            {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Checking…' : stage.name === 'enrol' ? 'Turn on two-step login' : 'Confirm'}
            </button>
          </form>
        )}
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Lost your phone? Another JobLink admin can reset two-step login for your account from the Supabase dashboard.
      </p>
    </div>
  );
}
