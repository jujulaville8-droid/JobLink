import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { createCvDocument, type ThemeId } from '@/lib/cv-pdf';
import { resumeFixture } from './fixtures/resume';

// Evaluate the real document's component tree, preserving text order.
function documentText(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(documentText).join(' ');
  if (!isValidElement<{ children?: ReactNode }>(node)) return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  if (typeof node.type === 'function') return documentText((node.type as (props: unknown) => ReactNode)(node.props));
  return documentText(node.props.children);
}

describe('studio resume document', () => {
  it('exports every supported section and every skill without dropping details', () => {
    const text = documentText(createCvDocument(resumeFixture, 'studio' as ThemeId));
    for (const value of ['Simone Francis', 'Skill 12', 'Service operations coursework', 'Recognised for mentoring', 'Feb 2027', 'Guest welcome guide', 'https://example.com/guide', 'Spanish', 'Conversational', 'Community Pantry', 'Organise weekly deliveries', 'Hospitality Network', 'Alex Example', 'Former supervisor', 'alex@example.com']) {
      expect(text).toContain(value);
    }
    expect(text).not.toContain('Built with JobLinks');
  });
  it('does not invent present employment for an undated, non-current role', () => {
    const cv = structuredClone(resumeFixture);
    cv.experiences = [{ ...cv.experiences[0], start_date: '', is_current: false }];
    expect(documentText(createCvDocument(cv, 'studio' as ThemeId))).not.toContain('Present');
  });
  it('omits empty optional sections', () => {
    const cv = { ...resumeFixture, projects: [], volunteer: [], languages: [], references: [], memberships: [] };
    const text = documentText(createCvDocument(cv, 'studio' as ThemeId));
    expect(text).not.toContain('References');
    expect(text).not.toContain('Languages');
  });
});
