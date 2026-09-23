"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getActivePathname,
  getPendingHref,
  isModifiedNavigation,
  type PendingNavigation,
} from "@/lib/navigation-state";

const PENDING_TIMEOUT_MS = 4_000;

export function useNavigationFeedback() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [previousPathname, setPreviousPathname] = useState(pathname);
  // Clear before children render; otherwise Back can resurrect an old pending link.
  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setPendingNavigation(null);
  }
  const pendingHref = getPendingHref(pathname, pendingNavigation);

  useEffect(() => {
    if (!pendingNavigation) return;

    const timeout = window.setTimeout(
      () =>
        setPendingNavigation((current) =>
          current === pendingNavigation ? null : current,
        ),
      PENDING_TIMEOUT_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [pendingNavigation]);

  const beginNavigation = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      const anchor = event.currentTarget;

      if (
        event.defaultPrevented ||
        isModifiedNavigation(event.nativeEvent) ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self") ||
        pathname === href
      ) {
        return;
      }

      if (pendingHref === href) {
        event.preventDefault();
        return;
      }

      setPendingNavigation({ href, fromPathname: pathname });
    },
    [pathname, pendingHref],
  );

  const prefetch = useCallback(
    (href: string) => router.prefetch(href),
    [router],
  );

  return {
    activePathname: getActivePathname(pathname, pendingHref),
    pendingHref,
    beginNavigation,
    prefetch,
    isPending: (href: string) => pendingHref === href,
  };
}
