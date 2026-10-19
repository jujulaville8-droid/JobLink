import { describe, expect, it } from 'vitest';
import { resumeFilename, resumeContentDisposition } from '@/lib/resume-filename';

describe('resume download names', () => {
  it.each([
    ['Jane', 'Smith', 'Jane Smith Resume.pdf'],
    ['  Jane  Anne ', ' Smith ', 'Jane Anne Smith Resume.pdf'],
    ['Élodie', 'O’Connor-Smith', 'Élodie O’Connor-Smith Resume.pdf'],
    ['李', '小龍', '李 小龍 Resume.pdf'],
    ['Mary Jane', '', 'Mary Jane Resume.pdf'],
    [null, undefined, 'Resume.pdf'],
    ['<>:"/\\|?*\r\n\u0000\u202e', '...', 'Resume.pdf'],
    ['../Jane', 'Smith/', 'Jane Smith Resume.pdf'],
    ['Jose\u0301', '', 'José Resume.pdf'],
  ])('sanitizes %j %j', (first, last, result) => expect(resumeFilename(first, last)).toBe(result));
  it('preserves the requested format', () => expect(resumeFilename('Jane', 'Smith', 'docx')).toBe('Jane Smith Resume.docx'));
  it('bounds UTF-8 length without breaking characters', () => {
    const name = resumeFilename('李'.repeat(500), '😀'.repeat(500));
    expect(new TextEncoder().encode(name).length).toBeLessThan(255);
    expect(name).toMatch(/ Resume\.pdf$/);
    expect(() => encodeURIComponent(name)).not.toThrow();
  });
  it('provides a safe ASCII fallback and Unicode UTF-8 name', () => {
    const name = resumeFilename('李', "O'Connor");
    const value = resumeContentDisposition(name);
    expect(value).toContain('filename="_ O\'Connor Resume.pdf"');
    expect(value).toContain("filename*=UTF-8''%E6%9D%8E%20O%27Connor%20Resume.pdf");
    expect(() => new Headers({ 'Content-Disposition': value })).not.toThrow();
  });
});
