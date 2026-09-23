'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import DashboardPageTransition from '@/components/DashboardPageTransition';

export default function DashboardCanvas({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/profile/cv') return <div className="w-full min-w-0">{children}</div>;
  return <div className="flex min-h-screen">
    {sidebar}
    <div className="min-w-0 flex-1 overflow-x-hidden md:ml-64">
      <div className="w-full max-w-6xl px-4 py-6 pb-20 sm:px-6 md:pb-6 lg:px-8"><DashboardPageTransition>{children}</DashboardPageTransition></div>
    </div>
  </div>;
}
