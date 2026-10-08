const INTERNAL_ORIGIN = "https://joblink.invalid";
const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f]/;
const APPLICATION_PATH = /^\/jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/apply$/i;

/** Accept only an internal absolute path, never an external or ambiguous URL. */
export function getSafeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || UNSAFE_CHARACTERS.test(value)) {
    return null;
  }

  try {
    // Check encoded path separators too, including nested encodings. Query and
    // fragment values do not change the destination's origin and stay intact.
    let path = value.split(/[?#]/, 1)[0];
    while (/%[0-9a-f]{2}/i.test(path)) {
      path = decodeURIComponent(path);
      if (path.startsWith("//") || UNSAFE_CHARACTERS.test(path)) return null;
    }

    const url = new URL(value, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN || url.pathname.startsWith("//")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Profile completion only returns to the job application that requested it. */
export function getApplicationReturnTo(value: string | null | undefined): string | null {
  const destination = getSafeReturnTo(value);
  return destination && APPLICATION_PATH.test(destination) ? destination : null;
}
