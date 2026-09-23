import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DashboardCanvas from '@/components/DashboardCanvas';
const route = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
beforeEach(() => { vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('focused resume workspace shell', () => {
  it('keeps dashboard navigation on ordinary pages', () => {
    route.pathname = '/dashboard';
    render(<DashboardCanvas sidebar={<nav>Account navigation</nav>}><h1>Dashboard</h1></DashboardCanvas>);
    expect(screen.getByRole('navigation')).toBeTruthy();
  });
  it('removes competing sidebar navigation only in the resume workspace', () => {
    route.pathname = '/profile/cv';
    render(<DashboardCanvas sidebar={<nav>Account navigation</nav>}><h1>Resume workspace</h1></DashboardCanvas>);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Resume workspace' })).toBeTruthy();
  });
});
