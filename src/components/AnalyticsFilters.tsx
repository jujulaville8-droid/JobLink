'use client';

import { useTransition, type ReactNode, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

/** GET remains usable without JS; transitions announce and display pending data. */
export default function AnalyticsFilters({ children, className }: { children: ReactNode; className: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) if (typeof value === 'string') params.set(key, value);
    startTransition(() => router.push(`/analytics?${params}`));
  }
  return <><form action="/analytics" method="get" onSubmit={submit} className={className} aria-busy={pending}>{children}</form>
    {pending && <div role="status" className="rounded-2xl bg-bg-alt p-5 motion-safe:animate-pulse">Loading analytics…</div>}
  </>;
}
