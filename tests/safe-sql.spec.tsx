import { describe, expect, it } from 'vitest';
import { escapePostgrestValue, ilikePattern, safeJsonLd } from '@/lib/safe-sql';

describe('safeJsonLd', () => {
  it('produces JSON that still parses back to the original value', () => {
    const value = { title: 'Chef', salary: 1000, remote: true, tags: ['a', 'b'] };
    expect(JSON.parse(safeJsonLd(value))).toEqual(value);
  });

  it('cannot be used to close the surrounding script tag', () => {
    // The attack: an employer puts this in a job description and it is
    // interpolated into <script type="application/ld+json">.
    const payload = { description: '</script><script>alert(1)</script>' };
    const out = safeJsonLd(payload);

    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    // Still semantically the same string once parsed.
    expect(JSON.parse(out).description).toBe('</script><script>alert(1)</script>');
  });

  it('escapes HTML comment and CDATA sequences', () => {
    const out = safeJsonLd({ t: '<!--<![CDATA[' });
    expect(out).not.toMatch(/[<>]/);
  });

  it('escapes the line separators that break JS parsers', () => {
    const out = safeJsonLd({ t: '  ' });
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
    expect(out).not.toContain(' ');
    expect(out).not.toContain(' ');
  });

  it('leaves ampersands unable to start an entity', () => {
    expect(safeJsonLd({ t: '&lt;' })).not.toContain('&');
  });
});

describe('escapePostgrestValue', () => {
  it('wraps the value in double quotes', () => {
    expect(escapePostgrestValue('chef')).toBe('"chef"');
  });

  it('neutralises the comma that splits an or() expression', () => {
    const escaped = escapePostgrestValue('Chef, Line');
    expect(escaped).toBe('"Chef, Line"');
    // The comma survives inside the quotes rather than becoming a delimiter.
    expect(escaped.startsWith('"')).toBe(true);
    expect(escaped.endsWith('"')).toBe(true);
  });

  it('escapes embedded quotes so the value cannot be closed early', () => {
    expect(escapePostgrestValue('say "hi"')).toBe('"say \\"hi\\""');
  });

  it('escapes backslashes before quotes', () => {
    expect(escapePostgrestValue('back\\slash')).toBe('"back\\\\slash"');
  });

  it('cannot inject an extra filter condition', () => {
    const escaped = escapePostgrestValue('x),status.eq.pending_approval,(title.ilike.y');
    // Everything stays inside one quoted literal.
    expect(escaped).toBe('"x),status.eq.pending_approval,(title.ilike.y"');
    expect(escaped.match(/"/g)).toHaveLength(2);
  });
});

describe('ilikePattern', () => {
  it('surrounds the term with wildcards', () => {
    expect(ilikePattern('chef')).toBe('"%chef%"');
  });

  it('trims surrounding whitespace', () => {
    expect(ilikePattern('  chef  ')).toBe('"%chef%"');
  });

  it("escapes the user's own LIKE wildcards", () => {
    // Otherwise searching for "100%" matches everything. The LIKE escape adds
    // a backslash, then the PostgREST quoting escapes that backslash again, so
    // the wire value carries a doubled backslash and decodes to `%100\%%`.
    expect(ilikePattern('100%')).toBe('"%100\\\\%%"');
    expect(ilikePattern('a_b')).toBe('"%a\\\\_b%"');
  });

  it('survives a comma without breaking out', () => {
    expect(ilikePattern('Chef, Line')).toBe('"%Chef, Line%"');
  });
});
