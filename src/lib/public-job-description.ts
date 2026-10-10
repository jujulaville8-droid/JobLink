// This is a presentation-only view of employer text. Never write its output
// back to a listing: the original wording and any known Google Jobs deadline
// remain source facts, independent of the site's manual-close policy.
const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DAY = '\\d{1,2}(?:st|nd|rd|th)?';
const DATE = `(?:${MONTH}\\.?[ \\t]+${DAY},?[ \\t]+\\d{4}|${DAY}[ \\t]+${MONTH}\\.?[ \\t]+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{4})`;
const LABEL = '(?:applications?[ \\t]+deadline|deadline[ \\t]+for[ \\t]+applications|(?:application[ \\t]+)?closing[ \\t]+date|applications?[ \\t]+close(?:s)?|apply[ \\t]+(?:before|by))';

// Remove only complete, explicitly labelled date sentences/lines. In
// particular, do not strip dates from work schedules, job duties, contact
// instructions, or ambiguous prose that merely mentions a deadline.
const APPLICATION_DEADLINE = new RegExp(
  `(?:^[ \\t]*(?:[-*•][ \\t]+)?|(?<=[.!?;])[ \\t]+)${LABEL}[ \\t]*(?:(?::|[-–—])[ \\t]*)?(?:on[ \\t]+)?${DATE}[ \\t]*(?:[.!?;](?=[ \\t\\r]|$)|(?=\\r?$))`,
  'gi',
);

export function publicJobDescription(description?: string | null): string {
  if (!description) return '';
  const visible = description.split('\n').map(line => {
    const cleaned = line.replace(APPLICATION_DEADLINE, '');
    return cleaned === line ? line : cleaned.trim();
  }).join('\n');
  return visible === description ? description : visible.replace(/\n{3,}/g, '\n\n').trim();
}
