export default function DashboardLoading() {
  return (
    <div
      aria-hidden="true"
      className="dashboard-loading min-h-[60vh] space-y-6"
    >
      <div className="space-y-3">
        <div className="skeleton h-8 w-52" />
        <div className="skeleton h-4 w-full max-w-md" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            data-loading-card
            className="rounded-2xl border border-border bg-white p-5"
          >
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-4 h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {[0, 1, 2, 3, 4].map((item) => (
          <div
            key={item}
            data-loading-row
            className="flex items-center gap-4 border-b border-border p-4 last:border-0"
          >
            <div className="skeleton h-11 w-11 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-2/5" />
              <div className="skeleton h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
