type NavigationEvent = Pick<
  MouseEvent,
  "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

export interface PendingNavigation {
  href: string;
  fromPathname: string;
}

export function isRouteActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isModifiedNavigation(event: NavigationEvent) {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

export function getActivePathname(
  pathname: string,
  pendingHref: string | null,
) {
  return pendingHref ?? pathname;
}

export function getActiveHref(pathname: string, hrefs: readonly string[]) {
  return (
    hrefs
      .filter((href) => isRouteActive(pathname, href))
      .sort((left, right) => right.length - left.length)[0] ?? null
  );
}

export function getPendingHref(
  pathname: string,
  pendingNavigation: PendingNavigation | null,
) {
  if (pendingNavigation?.fromPathname !== pathname) return null;
  return pendingNavigation.href;
}
