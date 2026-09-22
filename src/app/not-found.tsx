import Link from 'next/link'
export default function NotFound() {
  return <main className="mx-auto max-w-xl px-6 py-20 text-center">
    <h1 className="font-display text-3xl">Page not found</h1>
    <p className="mt-4">This page does not exist or is no longer available.</p>
    <Link href="/jobs" className="btn-primary mt-6 inline-block">Browse jobs</Link>
  </main>
}
