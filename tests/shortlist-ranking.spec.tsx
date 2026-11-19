// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyNewMarkers,
  buildShortlist,
  computeJobQueue,
  jobKeywords,
  matchSkills,
  shortlistProgress,
  toClientEntry,
  visibleEntries,
  type OverrideAction,
  type ShortlistApplication,
  type VerdictInfo,
} from '@/lib/shortlist/ranking';

const job = {
  title: 'Bartender',
  description: 'Busy beach bar needs a bartender for cocktails, cash handling and customer service.',
  category: 'Hospitality',
};

function app(id: string, appliedDay: number, skills: string[] = [], extra: Partial<ShortlistApplication> = {}, cv: string[] = [], years = 0): ShortlistApplication {
  return {
    id,
    applied_at: `2026-11-${String(appliedDay).padStart(2, '0')}T12:00:00Z`,
    status: 'applied',
    seeker: { id: `seeker-${id}`, first_name: id.toUpperCase(), last_name: 'Test', skills, cv_skills: cv, experience_years: years },
    ...extra,
  };
}

const v = (verdict: VerdictInfo['verdict']): VerdictInfo => ({ verdict, verdict_text: `${verdict} line` });

function fixture() {
  const applications = [
    app('weak-good', 18, ['Gardening']),
    app('strong-good', 10, ['Bartending', 'Cocktails', 'Cash handling', 'Customer service'], {}, [], 5),
    app('mid-good-old', 11, ['Cocktails']),
    app('mid-good-new', 12, ['Cocktails']),
    app('nei-old', 13),
    app('nei-new', 16),
    app('naf', 17),
    app('unavail', 18),
    app('unscreened', 19),
    app('removed', 15),
    app('pinned-naf', 9),
  ];
  const verdicts = new Map<string, VerdictInfo>([
    ['weak-good', v('good_fit')],
    ['strong-good', v('good_fit')],
    ['mid-good-old', v('good_fit')],
    ['mid-good-new', v('good_fit')],
    ['nei-old', v('not_enough_information')],
    ['nei-new', v('not_enough_information')],
    ['naf', v('not_a_fit')],
    ['unavail', v('unavailable')],
    ['removed', v('good_fit')],
    ['pinned-naf', v('not_a_fit')],
  ]);
  const overrides = new Map<string, Set<OverrideAction>>([
    ['removed', new Set<OverrideAction>(['remove'])],
    ['pinned-naf', new Set<OverrideAction>(['pin'])],
  ]);
  return { applications, verdicts, overrides };
}

describe('buildShortlist', () => {
  it('orders good_fit by internal score (ties newest first), then NEI newest, then not_a_fit, then unscreened', () => {
    const { entries } = buildShortlist({ job, ...fixture() });
    expect(entries.map(e => e.application.id)).toEqual([
      'strong-good',
      'mid-good-new',
      'mid-good-old',
      'weak-good',
      'nei-new',
      'nei-old',
      'naf',
      'pinned-naf',
      'unscreened',
    ]);
    expect(entries.at(-1)?.group).toBe('unscreened');
    expect(entries.at(-1)?.verdict).toBeNull();
  });

  it('excludes unavailable verdicts and removed candidates, keeps pinned ones in their ranked place', () => {
    const { entries, passed } = buildShortlist({ job, ...fixture() });
    const ids = entries.map(e => e.application.id);
    expect(ids).not.toContain('unavail');
    expect(ids).not.toContain('removed');
    expect(passed.map(e => e.application.id)).toEqual(['removed']);
    const pinned = entries.find(e => e.application.id === 'pinned-naf')!;
    expect(pinned.isPinned).toBe(true);
    expect(pinned.group).toBe('not_a_fit');
  });

  it('marks interview from status or override', () => {
    const data = fixture();
    data.applications[4] = { ...data.applications[4], status: 'interview' };
    data.overrides.set('naf', new Set<OverrideAction>(['interview']));
    const { entries } = buildShortlist({ job, ...data });
    expect(entries.find(e => e.application.id === 'nei-old')!.hasInterview).toBe(true);
    expect(entries.find(e => e.application.id === 'naf')!.hasInterview).toBe(true);
    expect(entries.find(e => e.application.id === 'nei-new')!.hasInterview).toBe(false);
  });

  it('matches skills against title + description + category, flagging resume-only matches', () => {
    const result = matchSkills(
      { id: 's', first_name: 'A', last_name: 'B', skills: ['Bartending', 'Gardening'], cv_skills: ['cash handling', 'bartending'] },
      jobKeywords(job),
    );
    expect(result.matched).toEqual([
      { name: 'Bartending', fromResume: false },
      { name: 'cash handling', fromResume: true },
    ]);
    expect(result.other).toEqual(['Gardening']);
  });

  it('slices the top 5 and expands to the full list; strips the score for clients', () => {
    const { entries } = buildShortlist({ job, ...fixture() });
    expect(visibleEntries(entries, false)).toHaveLength(5);
    expect(visibleEntries(entries, true)).toHaveLength(entries.length);
    expect(visibleEntries(entries.slice(0, 3), false)).toHaveLength(3);
    const client = toClientEntry(entries[0]);
    expect(client).not.toHaveProperty('score');
    expect(entries[0].score).toBeGreaterThan(entries[1].score);
  });

  it('marks new only inside the top 5 and only after the previous open', () => {
    const { entries } = buildShortlist({ job, ...fixture() });
    const never = applyNewMarkers(entries, null);
    expect(never.filter(e => e.isNew).map(e => e.application.id)).toEqual(entries.slice(0, 5).map(e => e.application.id));
    const since = applyNewMarkers(entries, '2026-11-14T00:00:00Z');
    expect(since.filter(e => e.isNew).map(e => e.application.id)).toEqual(['weak-good', 'nei-new']);
  });
});

describe('shortlistProgress', () => {
  it('counts reviewed (override or non-applied status) and interview-ready', () => {
    const progress = shortlistProgress([], [
      { id: 'a', status: 'applied' },
      { id: 'b', status: 'interview' },
      { id: 'c', status: 'hold' },
      { id: 'd', status: 'applied', overrides: new Set<OverrideAction>(['pin']) },
      { id: 'e', status: 'interview' },
      { id: 'f', status: 'applied', overrides: new Set<OverrideAction>() },
    ]);
    expect(progress).toEqual({ reviewed: 4, total: 6, interviewReady: 2 });
  });
});

describe('computeJobQueue', () => {
  const at = (d: number) => `2026-11-${String(d).padStart(2, '0')}T00:00:00Z`;
  it('counts applications, strong fits and new since last open, sorted by attention', () => {
    const queue = computeJobQueue([
      { id: 'empty', title: 'Empty', applications: [], verdicts: new Map(), lastOpenedAt: null },
      {
        id: 'cook', title: 'Line Cook', lastOpenedAt: at(15),
        applications: [{ id: 'c1', applied_at: at(10) }, { id: 'c2', applied_at: at(11) }],
        verdicts: new Map([['c1', 'good_fit'], ['c2', 'good_fit']]),
      },
      {
        id: 'bar', title: 'Bartender', lastOpenedAt: at(15),
        applications: [{ id: 'b1', applied_at: at(10) }, { id: 'b2', applied_at: at(16) }, { id: 'b3', applied_at: at(17) }],
        verdicts: new Map([['b1', 'good_fit'], ['b2', 'not_a_fit'], ['b3', 'unavailable']]),
      },
      {
        id: 'house', title: 'Housekeeper', lastOpenedAt: null,
        applications: [{ id: 'h1', applied_at: at(1) }],
        verdicts: new Map(),
      },
      {
        id: 'csr', title: 'CSR', lastOpenedAt: at(20),
        applications: [{ id: 's1', applied_at: at(1) }, { id: 's2', applied_at: at(2) }, { id: 's3', applied_at: at(3) }],
        verdicts: new Map([['s1', 'good_fit'], ['s2', 'good_fit']]),
      },
    ]);
    expect(queue.map(q => q.jobId)).toEqual(['bar', 'house', 'csr', 'cook', 'empty']);
    expect(queue[0]).toMatchObject({ applicationCount: 3, strongFitCount: 1, newCount: 2 });
    expect(queue[1]).toMatchObject({ applicationCount: 1, strongFitCount: 0, newCount: 1 });
    expect(queue[2]).toMatchObject({ applicationCount: 3, strongFitCount: 2, newCount: 0 });
    expect(queue[3]).toMatchObject({ applicationCount: 2, strongFitCount: 2, newCount: 0 });
    expect(queue[4]).toMatchObject({ applicationCount: 0, newCount: 0 });
  });
});
