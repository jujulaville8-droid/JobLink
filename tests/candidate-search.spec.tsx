import { describe, expect, it } from 'vitest';
import {
  buildCandidateHaystack,
  candidateMatchesQuery,
  tokenizeCandidateQuery,
  type CandidateSearchProfile,
  type CandidateSearchCv,
} from '@/lib/candidate-search';

function matches(q: string, profile: CandidateSearchProfile = {}, cv?: CandidateSearchCv) {
  return candidateMatchesQuery(buildCandidateHaystack(profile, cv), tokenizeCandidateQuery(q));
}

describe('candidate search', () => {
  it('normalizes case, curly apostrophes, whitespace and surrounding punctuation', () => {
    expect(tokenizeCandidateQuery('  “Driver’s”\tLicence,\n(John\'s) ... !!! '))
      .toEqual(["driver's", 'licence', "john's"]);
    expect(tokenizeCandidateQuery(' \n ... “”; ')).toEqual([]);
  });

  it.each([
    ['chef', { job_title: 'Head Chef' }],
    ['resort', { work_experiences: [{ company_name: 'Island Resort' }] }],
    ['carpenter', { work_experiences: [{ job_title: 'Carpenter' }] }],
    ['welding', { skills: [{ name: 'Welding' }] }],
    ['hospitality', { summary: 'Hospitality professional' }],
  ] satisfies [string, CandidateSearchCv][])('matches %s found only in CV data', (term, cv) => {
    expect(matches(term, {}, cv)).toBe(true);
    expect(matches(term)).toBe(false);
  });

  it.each(['driver', 'licence', 'drivers', 'license', 'driving', "Driver's Licence", 'Driver’s Licence'])(
    'matches licence flag using %s', (term) => {
      expect(matches(term, { has_drivers_licence: true })).toBe(true);
      expect(matches(term, { has_drivers_licence: false })).toBe(false);
      expect(matches(term)).toBe(false);
    },
  );

  it.each(['transport', 'transportation', 'vehicle', 'own transport'])('matches transport flag using %s', (term) => {
    expect(matches(term, { has_own_transport: true })).toBe(true);
    expect(matches(term, { has_own_transport: false })).toBe(false);
    expect(matches(term)).toBe(false);
  });

  it('requires every word across profile and CV fields', () => {
    const profile = { location: 'Saint John’s' };
    const cv = { job_title: 'Chef' };
    expect(matches("CHEF John's", profile, cv)).toBe(true);
    expect(matches('chef John’s astronaut', profile, cv)).toBe(false);
  });

  it.each([
    ['alice', { first_name: 'Alice' }],
    ['smith', { last_name: 'Smith' }],
    ['friendly', { bio: 'Friendly colleague' }],
    ['accounting', { skills: ['Cooking', 'Accounting'] }],
    ['cpr', { certifications: ['First Aid', 'CPR'] }],
    ['spanish', { languages: ['English', 'Spanish'] }],
    ['diploma', { education: 'College diploma' }],
    ['antigua', { location: 'Antigua' }],
  ] satisfies [string, CandidateSearchProfile][])('matches profile field containing %s', (term, profile) => {
    expect(matches(term, profile)).toBe(true);
  });

  it('normalizes apostrophes in profile and CV text', () => {
    expect(matches("john's", { bio: 'John’s assistant' })).toBe(true);
    expect(matches('john’s', {}, { work_experiences: [{ company_name: "John's Shop" }] })).toBe(true);
  });

  it('handles missing and nullable fields without adding searchable null text', () => {
    expect(buildCandidateHaystack({ bio: null, skills: null, languages: [null] }, {
      summary: null, skills: [{ name: null }], work_experiences: [{}],
    })).toBe('');
    expect(buildCandidateHaystack({}, null)).toBe('');
    expect(matches('null')).toBe(false);
  });

  it('matches empty queries and substring tokens', () => {
    expect(candidateMatchesQuery('', [])).toBe(true);
    expect(matches('...')).toBe(true);
    expect(matches('cook', { skills: ['Cooking'] })).toBe(true);
  });

  it('uses the specified virtual flag phrases', () => {
    expect(buildCandidateHaystack({ has_drivers_licence: true, has_own_transport: true }))
      .toBe("driver driver's licence drivers license driving licence own transport transportation vehicle");
  });
});
