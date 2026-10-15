import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';

const route = vi.hoisted(() => ({
  pathname: '/index',
  segment: null as string | null,
  router: { push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSelectedLayoutSegment: () => route.segment,
  useRouter: () => route.router,
}));
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
    userRole: null,
    isAdminUser: false,
    avatarUrl: null,
    isLoading: true,
    logout: vi.fn(),
    setUserRole: vi.fn(),
  }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => { throw new Error('Chrome hydration tests must not contact auth services.'); },
}));

const mountedRoots: Root[] = [];
const containers: HTMLElement[] = [];

function Chrome() {
  return <>
    <Navbar />
    <main><h1>Page content</h1><input aria-label="Local form input" defaultValue="Server value" /></main>
    <Footer />
    <BottomNav />
  </>;
}

function serverRender(pathname: string, segment: string | null) {
  route.pathname = pathname;
  route.segment = segment;
  const container = document.createElement('div');
  container.innerHTML = renderToString(<Chrome />);
  document.body.append(container);
  containers.push(container);
  return container;
}

async function hydrate(container: HTMLElement, pathname: string, segment: string | null) {
  route.pathname = pathname;
  route.segment = segment;
  const recoverableErrors: unknown[] = [];
  let root!: Root;
  await act(async () => {
    root = hydrateRoot(container, <Chrome />, {
      onRecoverableError: error => recoverableErrors.push(error),
    });
  });
  mountedRoots.push(root);
  return { root, recoverableErrors };
}

function expectHomeChrome(container: HTMLElement) {
  expect(container.querySelector('header.home-header')).not.toBeNull();
  expect(container.querySelector('footer.home-footer')).not.toBeNull();
  expect(container.querySelector('.dashboard-bottom-nav-link')).toBeNull();
  expect(within(container).getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
  expect(within(container).getByRole('navigation', { name: 'Footer navigation' })).toBeTruthy();
}

function expectOrdinaryChrome(container: HTMLElement, footer: boolean, hidden = false) {
  expect(container.querySelector('.home-header')).toBeNull();
  expect(container.querySelector('.home-footer')).toBeNull();
  expect(container.querySelector('header') !== null).toBe(!hidden);
  expect(container.querySelector('footer') !== null).toBe(footer);
  expect(container.querySelector('.dashboard-bottom-nav-link') !== null).toBe(!hidden);
}

beforeEach(() => {
  route.pathname = '/index';
  route.segment = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network is disabled in chrome hydration tests.')));
});

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) await act(async () => root.unmount());
  for (const container of containers.splice(0)) container.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('homepage chrome server rendering and hydration', () => {
  it('renders homepage chrome on the server when the root page has the internal /index pathname', () => {
    // Production root Flight payload: canonical URL parts ["", "index"], but
    // the selected child route is __PAGE__, which yields a null root segment.
    const container = serverRender('/index', null);
    expect.soft(container.querySelector('header.home-header')).not.toBeNull();
    expect.soft(container.querySelector('footer.home-footer')).not.toBeNull();
    expect.soft(container.querySelector('.dashboard-bottom-nav-link')).toBeNull();
  });

  it('hydrates /index server markup at browser / without regenerating the page, then opens the real menu', async () => {
    const container = serverRender('/index', null);
    const serverMain = container.querySelector('main');
    const serverInput = within(container).getByRole('textbox', { name: 'Local form input' }) as HTMLInputElement;
    serverInput.value = 'Typed before hydration';

    const { recoverableErrors } = await hydrate(container, '/', null);
    const hydratedInput = within(container).getByRole('textbox', { name: 'Local form input' }) as HTMLInputElement;

    expect.soft(recoverableErrors).toEqual([]);
    expect.soft(container.querySelector('main')).toBe(serverMain);
    expect.soft(hydratedInput).toBe(serverInput);
    expect.soft(hydratedInput.value).toBe('Typed before hydration');
    expectHomeChrome(container);

    fireEvent.click(within(container).getByRole('button', { name: 'Open menu' }));
    const mobileMenu = within(container).getByRole('navigation', { name: 'Mobile navigation' });
    expect(within(mobileMenu).getByRole('link', { name: 'Find jobs' }).getAttribute('href')).toBe('/jobs');
    expect(within(mobileMenu).getByRole('link', { name: 'Create employer account' }).getAttribute('href')).toBe('/signup?role=employer');
  });

  it.each([
    ['/jobs', 'jobs', true, false],
    ['/login', '(auth)', true, false],
    ['/dashboard', '(dashboard)', false, false],
    ['/profile/cv', '(dashboard)', false, true],
    ['/index', '_not-found', true, false],
  ] as const)('preserves the existing chrome on %s, including non-home route groups and not-found pages', async (pathname, segment, footer, hidden) => {
    const container = serverRender(pathname, segment);
    expectOrdinaryChrome(container, footer, hidden);
    const serverMain = container.querySelector('main');
    const { recoverableErrors } = await hydrate(container, pathname, segment);
    expect(recoverableErrors).toEqual([]);
    expect(container.querySelector('main')).toBe(serverMain);
    expectOrdinaryChrome(container, footer, hidden);
  });

  it('preserves the homepage chrome on the design preview route', async () => {
    const container = serverRender('/design-preview', 'design-preview');
    expectHomeChrome(container);
    const { recoverableErrors } = await hydrate(container, '/design-preview', 'design-preview');
    expect(recoverableErrors).toEqual([]);
    expectHomeChrome(container);
  });

  it('updates the chrome on client transitions between the root page and jobs even with the internal root pathname', async () => {
    const container = serverRender('/', null);
    const { root, recoverableErrors } = await hydrate(container, '/', null);
    expectHomeChrome(container);

    route.pathname = '/jobs';
    route.segment = 'jobs';
    await act(async () => root.render(<Chrome />));
    expectOrdinaryChrome(container, true);
    expect(container.querySelector('.dashboard-bottom-nav-link[aria-current="page"]')?.getAttribute('href')).toBe('/jobs');

    route.pathname = '/index';
    route.segment = null;
    await act(async () => root.render(<Chrome />));
    expectHomeChrome(container);
    expect(recoverableErrors).toEqual([]);
  });
});
