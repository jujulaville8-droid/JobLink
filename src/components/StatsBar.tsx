export default function StatsBar() {
  const stats = [
    {
      label: "Job Seekers",
      value: "2,400",
      icon: (
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      label: "Active Listings",
      value: "180",
      icon: (
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      ),
    },
    {
      label: "Companies",
      value: "85",
      icon: (
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto bg-primary/5 rounded-xl border border-primary/10 px-4 py-4 sm:px-8 sm:py-5">
      <div className="flex items-center justify-around gap-4 sm:gap-8">
        {stats.map((stat, i) => (
          <div key={stat.label} className="flex items-center gap-3">
            {i > 0 && (
              <div className="hidden sm:block w-px h-10 bg-primary/15 -ml-4 sm:-ml-6 mr-2 sm:mr-2" />
            )}
            <div className="text-primary hidden sm:block">{stat.icon}</div>
            <div className="text-center sm:text-left">
              <p className="text-xl sm:text-2xl font-bold text-primary">
                {stat.value}
              </p>
              <p className="text-xs sm:text-sm text-text-light">
                {stat.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
