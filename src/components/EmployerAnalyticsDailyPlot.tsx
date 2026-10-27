export default function EmployerAnalyticsDailyPlot({ title, daily, partialDays = [] }: { title: string; daily: Record<string, number | null>; partialDays?: string[] }) {
  const entries = Object.entries(daily);
  const max = Math.max(1, ...entries.map(([, n]) => n ?? 0));
  const total = entries.reduce((sum, [, n]) => sum + (n ?? 0), 0);
  return <section className="rounded-2xl border border-border bg-surface p-5">
    <h2 className="font-display text-xl">{title}</h2>
    <p>{total} recorded in the available period · Daily scale: 0–{max}</p>
    <svg viewBox="0 0 600 150" role="img" aria-label={`${title}: ${total}. Daily values in the table below.`} className="mt-4 w-full text-primary">
      {entries.map(([day, n], i) => n !== null && <rect key={day} x={i * 600 / entries.length + 2} y={140 - n / max * 130} width={600 / entries.length - 4} height={n / max * 130} fill="currentColor" />)}
      <line x1="0" x2="600" y1="140" y2="140" stroke="currentColor" />
    </svg>
    <details className="mt-3"><summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-primary">Daily data for {title.toLowerCase()}</summary>
      <table className="mt-3 w-full text-left text-sm"><caption className="text-text-muted">America/Antigua · Today is partial</caption><thead><tr><th scope="col">Date</th><th scope="col">{title}</th></tr></thead><tbody>
        {entries.map(([day, n], i) => <tr key={day}><th scope="row" className="font-normal">{day}{i === entries.length - 1 ? ' (partial today)' : ''}{partialDays.includes(day) ? ' (partial launch day)' : ''}</th><td>{n === null ? 'Not recorded' : n}</td></tr>)}
      </tbody></table>
    </details>
  </section>;
}

