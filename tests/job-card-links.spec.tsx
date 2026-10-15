import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import JobCard, { type Job } from '@/components/JobCard';

const job: Job = {
  id: 'bb1b011d-4e5c-4005-81b6-bc70c48acf4f',
  title: 'Carpenter / Boatbuilder',
  company_name: 'Woodstock BoatBuilders',
  location: 'Antigua',
  job_type: 'full_time',
  created_at: '2026-09-01T12:00:00Z',
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('puts the visible title inside one crawlable detail anchor in the initial server HTML', () => {
  const document = new DOMParser().parseFromString(renderToString(<JobCard job={job} />), 'text/html');
  const links = document.querySelectorAll(`a[href="/jobs/${job.id}"]`);
  expect(links).toHaveLength(1);
  expect(links[0].textContent?.trim()).toBe(job.title);
  expect(document.querySelector('h3 a')).toBe(links[0]);
  expect(links[0].getAttribute('aria-label')).toBe(`View ${job.title} at ${job.company_name}`);
});

it.each([{ highlight: false }, { highlight: true }, { is_featured: true }, { is_pro_company: true }])
  ('retains a descriptive title link for card variant %j', (variant) => {
    const { container } = render(<JobCard job={{ ...job, ...variant }} highlight={!!variant.highlight} />);
    const link = screen.getByRole('link', { name: `View ${job.title} at ${job.company_name}` });
    expect(link.textContent).toBe(job.title);
    expect(container.querySelectorAll(`a[href="/jobs/${job.id}"]`)).toHaveLength(1);
    expect(link.className).toContain('after:inset-0');
    expect(link.className).toContain('focus-visible:after:outline-2');
  });

it('keeps Save and WhatsApp outside the detail link and preserves their actions', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ saved: true }) });
  vi.stubGlobal('fetch', fetcher);
  render(<JobCard job={job} loggedIn />);
  const link = screen.getByRole('link', { name: `View ${job.title} at ${job.company_name}` });
  const save = screen.getByRole('button', { name: 'Save job' });
  const share = screen.getByRole('link', { name: 'Share on WhatsApp' });
  expect(link.contains(save)).toBe(false);
  expect(link.contains(share)).toBe(false);
  expect(save.className).toContain('z-10');
  expect(share.className).toContain('z-10');
  const shareUrl = new URL(share.getAttribute('href')!);
  expect(shareUrl.hostname).toBe('wa.me');
  expect(shareUrl.searchParams.get('text')).toContain(`https://joblinkantigua.com/jobs/${job.id}`);
  fireEvent.click(save);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Unsave job' })).toBe(save));
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/jobs/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: job.id }),
  });
});

it('orders the title link before the independent actions without duplicate detail tab stops', () => {
  const { container } = render(<JobCard job={job} loggedIn />);
  const focusable = container.querySelectorAll('a[href], button');
  expect(Array.from(focusable).map(element => element.getAttribute('aria-label'))).toEqual([
    `View ${job.title} at ${job.company_name}`, 'Save job', 'Share on WhatsApp',
  ]);
});

it('escapes unusual employer and title text without creating extra anchors', () => {
  const unusualJob = { ...job, title: 'Cook <assistant> & Prep', company_name: 'A & B "Cafe"' };
  const document = new DOMParser().parseFromString(renderToString(<JobCard job={unusualJob} />), 'text/html');
  const links = document.querySelectorAll(`a[href="/jobs/${job.id}"]`);
  expect(links).toHaveLength(1);
  expect(links[0].textContent).toBe(unusualJob.title);
  expect(document.querySelector('assistant')).toBeNull();
});
