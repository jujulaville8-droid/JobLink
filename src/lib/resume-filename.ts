import type { CvExtension } from './cv-upload';
/** Shared download/display naming only; never use this to rename storage objects. */
export function resumeFilename(firstName?: string | null, lastName?: string | null, extension: CvExtension = 'pdf'): string {
  const raw = [firstName, lastName].filter((part): part is string => typeof part === 'string').join(' ').normalize('NFC');
  // Keep names in their original script, but remove path, control and bidi characters.
  const clean = raw.replace(/[<>:"/\\|?*\p{Cc}\p{Cf}\p{Cs}]/gu, ' ').replace(/\s+/gu, ' ').replace(/^[. ]+|[. ]+$/g, '');
  // Leave room for the suffix on filesystems with a 255-byte filename limit.
  let name = '';
  for (const char of clean) {
    if (new TextEncoder().encode(name + char).length > 180) break;
    name += char;
  }
  name = name.replace(/[. ]+$/g, '');
  return `${name ? `${name} Resume` : 'Resume'}.${extension}`;
}

/** ASCII fallback plus RFC 5987 UTF-8 preserves Unicode without invalid HTTP headers. */
export function resumeContentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
