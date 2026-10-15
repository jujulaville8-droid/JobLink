import { describe, expect, it } from 'vitest';
import { publicJobDescription } from '@/lib/public-job-description';

const observedDeadlines = [
  'Application deadline: October 3, 2026.',
  'Apply before: 29 October 2026',
  'Application deadline: 30 October 2026.',
  'Applications close October 30, 2026.',
];

describe('public job descriptions', () => {
  it.each(observedDeadlines)('hides the observed deadline without changing source text: %s', deadline => {
    const source = Object.freeze({ description: `Work Saturdays, 8am–4pm.\n\n${deadline}\n\nEmail office@example.com to apply.` });
    const original = source.description;
    expect(publicJobDescription(source.description)).toBe('Work Saturdays, 8am–4pm.\n\nEmail office@example.com to apply.');
    expect(source.description).toBe(original);
  });

  it.each([
    '• Application deadline: 30 October 2026.',
    '- APPLY BEFORE: 29 OCTOBER 2026',
    'Closing date: 2026-10-30',
    'Application closing date: 30/10/2026',
    'Deadline for applications: Oct. 30, 2026.',
    'Apply by: 30th October 2026.',
  ])('removes an unambiguous labelled date line: %s', deadline => {
    expect(publicJobDescription(`Cook\n${deadline}\nSaturday only`)).toBe('Cook\n\nSaturday only');
  });

  it('removes only the deadline sentence when contact instructions share its line', () => {
    expect(publicJobDescription('Email office@woodstockboats.com to apply. Apply before: 29 October 2026. Learn more: woodstockboatbuilders.com'))
      .toBe('Email office@woodstockboats.com to apply. Learn more: woodstockboatbuilders.com');
    expect(publicJobDescription('Application deadline: October 3, 2026. Send your CV to jobs@example.com.'))
      .toBe('Send your CV to jobs@example.com.');
  });

  it.each([
    'Work Saturdays, 8am–4pm. Start date: October 3, 2026.',
    'Meet project deadlines and submit weekly reports by Friday.',
    'Process applications before the daily reporting deadline.',
    'Call 268-555-0100 or email jobs@example.com to apply.',
    'Send your CV to jobs@example.com by October 30, 2026.',
    'Our application deadline depends on the project schedule.',
    'Certification expires October 30, 2026.',
    '  Keep original spacing.\n\n- Familiar with closing date reports\n',
  ])('preserves schedules, duties, contact details and ambiguous prose byte for byte: %s', text => {
    expect(publicJobDescription(text)).toBe(text);
  });

  it('handles empty and deadline-only descriptions without replacement facts', () => {
    expect(publicJobDescription()).toBe('');
    expect(publicJobDescription(null)).toBe('');
    expect(publicJobDescription('')).toBe('');
    expect(publicJobDescription(observedDeadlines[0])).toBe('');
  });

  it('preserves a near-limit whitespace-heavy deadline label without a date', () => {
    const source = `Application deadline${' '.repeat(19900)}not specified`;
    expect(source.length).toBeLessThanOrEqual(20000);
    expect(publicJobDescription(source)).toBe(source);
  });

  it('is idempotent and removes repeated explicit sentences', () => {
    const source = 'Cook. Application deadline: October 3, 2026. Apply before: 29 October 2026. Saturday only.';
    expect(publicJobDescription(source)).toBe('Cook. Saturday only.');
    expect(publicJobDescription(publicJobDescription(source))).toBe(publicJobDescription(source));
  });

  it.each(observedDeadlines)('also removes pasted CRLF deadline lines: %s', deadline => {
    const source = `Cook\r\n${deadline}\r\nEmail jobs@example.com to apply.`;
    const visible = publicJobDescription(source);
    expect(visible).not.toContain(deadline);
    expect(visible).toContain('Cook');
    expect(visible).toContain('Email jobs@example.com to apply.');
  });
});
