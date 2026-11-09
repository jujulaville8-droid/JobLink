import { normalizeJobLocation } from "@/lib/job-location";

/**
 * Parish (or Barbuda) for JobPosting.addressRegion.
 *
 * Google's addressRegion warning is for the administrative region. Antigua's
 * parishes are that region. A value is returned only when the location text
 * names one parish, the city of St. John's (which sits in Saint John), or a
 * place that belongs to exactly one parish. "Antigua" alone, a road that
 * crosses parishes (Old Parham Road), a remote label, or two different
 * parishes produce no region. Nothing here invents a street, a postal code,
 * or a default of Saint John.
 *
 * Place-to-parish pairs follow the populated-place list and the parish
 * articles (Saint Peter includes Pares, Parham and Crabbs Peninsula; Saint
 * Mary includes Jennings; Saint Paul includes English Harbour, Falmouth and
 * Cobbs Cross; Saint George includes Coolidge and Paynters, beside the airport).
 */
const PLACES: { pattern: RegExp; region: string }[] = [
  { pattern: /\bst\.?\s*john'?s?\b|\bsaint\s+john'?s?\b/i, region: "Saint John" },
  { pattern: /\bst\.?\s*george\b|\bsaint\s+george\b/i, region: "Saint George" },
  { pattern: /\bst\.?\s*mary\b|\bsaint\s+mary\b/i, region: "Saint Mary" },
  { pattern: /\bst\.?\s*paul\b|\bsaint\s+paul\b/i, region: "Saint Paul" },
  { pattern: /\bst\.?\s*peter\b|\bsaint\s+peter\b/i, region: "Saint Peter" },
  { pattern: /\bst\.?\s*philip'?s?\b|\bsaint\s+philip'?s?\b/i, region: "Saint Philip" },
  { pattern: /\bbarbuda\b/i, region: "Barbuda" },

  { pattern: /\bredcliffe quay\b/i, region: "Saint John" },
  { pattern: /\bnewgate street\b/i, region: "Saint John" },
  { pattern: /\bfriars?\s+hill\b/i, region: "Saint John" },
  { pattern: /\bfive islands\b/i, region: "Saint John" },
  { pattern: /\bdickenson bay\b/i, region: "Saint John" },
  { pattern: /\bhodges bay\b/i, region: "Saint John" },
  { pattern: /\bheritage quay\b/i, region: "Saint John" },
  { pattern: /\bdeep\s*water harbour\b/i, region: "Saint John" },
  { pattern: /\bcruise port\b/i, region: "Saint John" },
  { pattern: /\bgunthorpes\b/i, region: "Saint John" },
  { pattern: /\bpiggotts ville\b/i, region: "Saint John" },

  { pattern: /\bcoolidge\b/i, region: "Saint George" },
  { pattern: /\bpaynters\b/i, region: "Saint George" },
  { pattern: /\bosbourn\b/i, region: "Saint George" },
  { pattern: /\bpiggotts\b(?!\s+ville\b)/i, region: "Saint George" },
  { pattern: /\bbarnes hill\b/i, region: "Saint George" },
  { pattern: /\bfitches creek\b/i, region: "Saint George" },
  { pattern: /\bsea view farm\b/i, region: "Saint George" },

  { pattern: /\benglish harbour\b/i, region: "Saint Paul" },
  { pattern: /\bfalmouth\b/i, region: "Saint Paul" },
  { pattern: /\bnelson'?s dockyard\b/i, region: "Saint Paul" },
  { pattern: /\bcobbs?\s+cross\b/i, region: "Saint Paul" },
  { pattern: /\bbethesda\b/i, region: "Saint Paul" },
  { pattern: /\bliberta\b/i, region: "Saint Paul" },

  { pattern: /\bpares\b/i, region: "Saint Peter" },
  // The town of Parham. "Old Parham Road" and "Parham Road" are not the town.
  { pattern: /\bparham\b(?!\s+road\b)/i, region: "Saint Peter" },
  { pattern: /\bcrabb'?s peninsula\b|\bcrabbs peninsula\b/i, region: "Saint Peter" },

  { pattern: /\bjennings\b/i, region: "Saint Mary" },
  { pattern: /\bhermitage bay\b/i, region: "Saint Mary" },
  { pattern: /\bjolly harbour\b/i, region: "Saint Mary" },
  { pattern: /\bbolans\b/i, region: "Saint Mary" },
  { pattern: /\bold road\b/i, region: "Saint Mary" },
  { pattern: /\bjohnsons?\s+point\b/i, region: "Saint Mary" },
  { pattern: /\burlings\b/i, region: "Saint Mary" },
  { pattern: /\bjohn hughes\b/i, region: "Saint Mary" },

  { pattern: /\bwillikies\b/i, region: "Saint Philip" },
  { pattern: /\bfreetown\b/i, region: "Saint Philip" },
  { pattern: /\bseatons\b/i, region: "Saint Philip" },
  { pattern: /\bnewfield\b/i, region: "Saint Philip" },
  { pattern: /\bglanvilles\b/i, region: "Saint Philip" },
  { pattern: /\bhalf moon bay\b/i, region: "Saint Philip" },

  { pattern: /\bcodrington\b/i, region: "Barbuda" },
];

interface PlaceSpan {
  start: number;
  end: number;
  region: string;
}

function placeSpans(body: string): PlaceSpan[] {
  const spans: PlaceSpan[] = [];
  for (const place of PLACES) {
    const flags = place.pattern.flags.includes("g") ? place.pattern.flags : `${place.pattern.flags}g`;
    const re = new RegExp(place.pattern.source, flags);
    for (const match of body.matchAll(re)) {
      const start = match.index ?? 0;
      spans.push({ start, end: start + match[0].length, region: place.region });
    }
  }
  return spans.filter((span) => !spans.some((other) =>
    other !== span
    && other.start <= span.start
    && other.end >= span.end
    && other.end - other.start > span.end - span.start
  ));
}

/** Administrative region for a job or company location string, or undefined. */
export function jobAddressRegion(location: string | null | undefined): string | undefined {
  const raw = normalizeJobLocation(location).replace(/[\u2018\u2019]/g, "'");
  if (!raw) return undefined;
  if (/^antigua(\s+(and|&)\s+barbuda)?$/i.test(raw)) return undefined;

  const body = raw.replace(/,?\s*antigua(\s+(and|&)\s+barbuda)?\s*$/i, "").trim();
  if (!body || /^remote\b/i.test(body)) return undefined;

  const regions = new Set(placeSpans(body).map((span) => span.region));
  if (regions.size === 1) return [...regions][0];
  return undefined;
}
