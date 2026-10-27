import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const layout = readFileSync('src/app/(dashboard)/layout.tsx', 'utf8');
const section = (source: string, name: string) => source.split(`const ${name} = [`)[1].split('];')[0];
it('has exact employer order and preserves seeker/admin arrays and unread badges', () => {
  expect([...section(layout, 'employerLinks').matchAll(/label: "([^"]+)"/g)].map(m => m[1])).toEqual(['Dashboard', 'My Listings', 'Analytics', 'Inbox', 'Settings']);
  expect([...section(layout, 'seekerLinks').matchAll(/href: "([^"]+)"/g)].map(m => m[1])).toEqual(["/dashboard", "/profile", "/profile/cv", "/jobs", "/applications", "/messages", "/saved", "/alerts", "/settings"]);
  expect([...section(layout, 'adminLinks').matchAll(/href: "([^"]+)"/g)].map(m => m[1])).toEqual(["/dashboard", "/admin/inbox", "/admin/applications", "/admin/post-job", "/admin/jobs", "/admin/companies", "/admin/users", "/admin/approvals", "/admin/reports", "/admin/analytics", "/admin/featured", "/admin/emails", "/admin/testimonials", "/admin/employer-enquiries", "/admin/resume-writing"]);
  expect(layout).toContain('badge: <UnreadBadge />');
  expect(layout).toContain('userData.is_admin === true ? adminLinks.map(decorateLink)');
  expect(layout).toContain('label: "Analytics", icon: "bar-chart"');
});
it('keeps persistent top home actions and mobile Explore destinations', () => {
  const home = readFileSync('src/app/(dashboard)/dashboard/page.tsx', 'utf8');
  const employer = home.split('async function EmployerDashboard')[1];
  const top = employer.split('{/* Quick Stats */}')[0];
  for (const path of ['/company-profile', '/post-job', '/browse-candidates', '/analytics']) expect(top).toContain(`href="${path}"`);
  expect(home.split('async function EmployerDashboard')[0]).not.toContain('Employer actions');
  const explore = section(readFileSync('src/app/explore/page.tsx', 'utf8'), 'employerLinks');
  for (const path of ['/analytics', '/company-profile', '/browse-candidates', '/post-job']) expect(explore).toContain(`href: "${path}"`);
});
it('retains the separate admin analytics route and chart import', () => {
  expect(section(layout, 'adminLinks')).toContain('/admin/analytics');
  expect(readFileSync('src/app/(dashboard)/admin/analytics/page.tsx', 'utf8')).toContain('@/components/AnalyticsCharts');
});
