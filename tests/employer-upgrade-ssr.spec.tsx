import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));

describe('/employers/upgrade server HTML', () => {
  it('includes the heading and both plans before the session check', async () => {
    const { default: UpgradePage } = await import('@/app/employers/upgrade/page');
    const html = renderToString(<UpgradePage />);
    expect(html).toContain('Find the right hire, faster.');
    expect(html).toContain('Free');
    expect(html).toContain('Pro');
    expect(html).toContain('19.99');
    expect(html).toContain('Unlimited active job listings');
    expect(html).not.toContain('Upgrade to Pro</a>');
  });
});
