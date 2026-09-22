"use client";

import { usePathname } from "next/navigation";

export default function DashboardPageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="dashboard-page-enter min-h-[60vh]">
      {children}
    </div>
  );
}
