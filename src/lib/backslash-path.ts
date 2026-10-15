// Some crawlers and scraped links append backslashes (raw or encoded as %5C)
// to page URLs. Next.js cannot resolve those paths and answers with a 500.
// Returns the clean path to redirect to, or null when the path has none.
export function stripBackslashes(pathname: string): string | null {
  if (!/\\|%5c/i.test(pathname)) return null;
  const cleaned = pathname.replace(/\\|%5c/gi, '').replace(/\/{2,}/g, '/');
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}
