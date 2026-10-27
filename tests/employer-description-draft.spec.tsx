// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { generateDescription } from '@/lib/job-description-draft';
import { EMPTY_POSTING } from '@/lib/job-posting';
import { buildEmailHtml } from '@/lib/email-templates';
const form = { ...EMPTY_POSTING, title: 'Chef', location: 'English Harbour', salary_min: '25', salary_type: 'hourly' as const };
it('falls back without credentials, including entered basics without inventing requirements', async () => {
  const call = vi.fn();
  const result = await generateDescription(form, { fetch: call });
  expect(result.source).toBe('template');
  expect(result.description).toContain('Chef'); expect(result.description).toContain('EC$25');
  expect(result.description).toContain('[Add the skills'); expect(call).not.toHaveBeenCalled();
});
it('uses the screening model adapter constants with bounded single-attempt Responses transport', async () => {
  const description = 'About the role\nWe are hiring a Chef.\nResponsibilities\nPrepare meals for guests.';
  const call = vi.fn().mockResolvedValue(Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: description }] }] }));
  expect(await generateDescription(form, { enabled: true, apiKey: 'test', fetch: call })).toEqual({ description, source: 'ai' });
  expect(call).toHaveBeenCalledTimes(1);
  const body = JSON.parse(call.mock.calls[0][1].body);
  expect(body).toMatchObject({ model: 'gpt-6-luna', store: false, max_output_tokens: 1600 });
});
it.each(['network', 'malformed', 'refusal', 'oversize'])('falls back on %s without surfacing provider errors', async failure => {
  const call = vi.fn().mockImplementation(async () => {
    if (failure === 'network') throw new Error('private provider error');
    if (failure === 'oversize') return new Response('x'.repeat(33000));
    return Response.json(failure === 'refusal' ? { status: 'completed', output: [] } : {});
  });
  expect((await generateDescription(form, { enabled: true, apiKey: 'test', fetch: call })).source).toBe('template');
  expect(call).toHaveBeenCalledTimes(1);
});
it.each(['listing_submitted', 'listing_submitted_admin'])('%s uses wrapper, escaped content, review copy and no em dashes', type => {
  const email = buildEmailHtml(type, { job_title: '<Chef>', company_name: 'A&B' });
  expect(email.html).toContain('&lt;Chef&gt;'); expect(email.html).toContain('A&amp;B');
  expect(email.html).toContain('review'); expect(email.html).toContain('#0d7377');
  expect(email.html + email.subject).not.toMatch(/\u2014|&mdash;/);
});
