"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export default function DashboardPageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = container.current?.animate(
      [{ opacity: 0.8 }, { opacity: 1 }],
      { duration: 180, easing: 'ease-out' },
    );
    return () => animation?.cancel();
  }, [pathname]);

  return (
    <div ref={container} className="min-h-[60vh]">
      {children}
    </div>
  );
}
