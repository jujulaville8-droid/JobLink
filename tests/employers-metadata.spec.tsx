import { expect, it } from 'vitest';
import { metadata } from '@/app/employers/page';

const title = 'Post a Job Free in Antigua and Barbuda | JobLink';
const description = 'Hire in Antigua and Barbuda. Post a job for free on JobLink, reach local job seekers, and review applications in one place.';
const url = 'https://joblinkantigua.com/employers';

it('uses employer-page search and social metadata instead of the homepage tags', () => {
  expect(metadata.title).toEqual({ absolute: title });
  expect(metadata.description).toBe(description);
  expect(metadata.alternates?.canonical).toBe(url);
  expect(metadata.robots).toEqual({ index: true, follow: true });
  expect(metadata.openGraph).toMatchObject({ title, description, url });
  expect(metadata.twitter).toMatchObject({ title, description });
  expect(metadata.openGraph?.url).not.toBe('https://joblinkantigua.com');
  expect(metadata.openGraph?.title).not.toBe('JobLink | Jobs in Antigua and Barbuda');
  expect(metadata.twitter?.title).not.toBe('JobLink | Jobs in Antigua and Barbuda');
  expect(String(metadata.openGraph?.description)).not.toContain('#1');
  expect(String(metadata.twitter?.description)).not.toContain('#1');
  expect(title.endsWith('| JobLink | JobLink')).toBe(false);
});
