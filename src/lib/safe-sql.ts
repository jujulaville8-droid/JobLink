/**
 * Helpers for safely embedding user input in places where a naive template
 * string is unsafe.
 */

/**
 * Serialise a value for embedding in a `<script type="application/ld+json">`
 * block.
 *
 * `JSON.stringify` does not escape `<`, `>` or `/`, so a job description
 * containing `</script><script>...` terminates the JSON-LD block early and
 * everything after it is parsed as HTML. Escaping the three characters as
 * `\uXXXX` keeps the JSON semantically identical while making it impossible to
 * close the tag or open a comment.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Escape a value for use inside a PostgREST filter expression such as
 * `.or('title.ilike.VALUE,description.ilike.VALUE')`.
 *
 * PostgREST splits `or()` on commas and parentheses. Raw user input therefore
 * broke the filter apart: searching for `Chef, Line` produced three malformed
 * conditions and the request failed with a 400, so any search containing a
 * comma returned an error page instead of results.
 *
 * PostgREST allows a double-quoted value, within which `"` and `\` are escaped
 * with a backslash. Quoting neutralises commas, parentheses and dots.
 */
export function escapePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Build an `ilike` pattern for a PostgREST filter expression, with the LIKE
 * wildcards in the user's input neutralised so a search for `100%` does not
 * become a match-everything pattern.
 */
export function ilikePattern(term: string): string {
  const escaped = term.trim().replace(/[\\%_]/g, (char) => `\\${char}`)
  return escapePostgrestValue(`%${escaped}%`)
}
