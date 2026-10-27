export default function AnalyticsLoading() {
  return <div role="status" aria-label="Loading analytics" className="space-y-6"><p>Loading analytics…</p><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map(n => <div key={n} className="h-28 rounded-2xl bg-bg-alt motion-safe:animate-pulse" />)}</div><div className="h-64 rounded-2xl bg-bg-alt motion-safe:animate-pulse" /></div>;
}
