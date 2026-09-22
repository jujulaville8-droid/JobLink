'use client'
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl px-6 py-20 text-center">
    <h1 className="font-display text-3xl">Temporarily unavailable</h1>
    <p className="mt-4 text-text-light">We could not load this page. Please try again shortly.</p>
    <button className="btn-primary mt-6" onClick={reset}>Try again</button>
  </main>
}
