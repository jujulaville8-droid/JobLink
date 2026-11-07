// JobPosting JSON-LD only. Visible page text, search/share metadata and the
// stored listing keep the original address. Do not use this helper for those.
const EMAIL_ADDRESS = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Replace email addresses before they are copied into JobPosting.description. */
export function redactJobPostingEmails(text: string): string {
  return text.replace(EMAIL_ADDRESS, '[redacted]');
}
