type NavigationEvent = Pick<
  MouseEvent,
  "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

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
