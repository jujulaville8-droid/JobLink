import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { publicJobDescription } from '@/lib/public-job-description';
import { publicVacancyDescription } from '@/lib/public-vacancy-description';
import { redactJobPostingEmails } from '@/lib/seo/jobposting-description';

describe('JobPosting email redaction', () => {
  it.each([
    'info@colibriantigua.com',
    'touraroundantigua@gmail.com',
    'info@dovecoveantigua.com',
    'friesguys268@gmail.com',
    'EMANOUSOU@NOBUHOTELS.COM',
    'office@example.com',
  ])('replaces %s and leaves the surrounding sentence', address => {
    const source = `How to apply: email ${address}.`;
    expect(redactJobPostingEmails(source)).toBe('How to apply: email [redacted].');
    expect(redactJobPostingEmails(source)).not.toContain(address);
    expect(publicJobDescription(source)).toBe(source);
    expect(publicVacancyDescription({ title: 'Role', description: source })).toBe(source);
  });

  it('redacts every address and ignores text that is not an address', () => {
    const source = 'Email info@colibriantigua.com or touraroundantigua@gmail.com. Call 268-555-0100. Apply at the desk.';
    expect(redactJobPostingEmails(source)).toBe('Email [redacted] or [redacted]. Call 268-555-0100. Apply at the desk.');
    expect(redactJobPostingEmails('Hiring for this vacancy.')).toBe('Hiring for this vacancy.');
    expect(redactJobPostingEmails('')).toBe('');
  });

  it('keeps a multiline description except for the address', () => {
    const source = 'Line one info@dovecoveantigua.com\nLine two';
    expect(redactJobPostingEmails(source)).toBe('Line one [redacted]\nLine two');
  });

  it('records Progressive Vision as a site-owner request without an employer address', () => {
    const source = readFileSync('src/lib/seo/employerApproved.ts', 'utf8');
    const start = source.indexOf('"e60b9e69-cfdb-4edb-b7b6-e21e22bb24f2"');
    const entry = source.slice(start - 400, start + 500);
    expect(entry).toContain('Site owner requested Google Jobs allowlist on 2026-11-06 for this already-live admin-posted listing (created 2026-11-03).');
    expect(entry).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });
});
