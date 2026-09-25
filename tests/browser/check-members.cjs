const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4191';
  const browser = await chromium.launch({ headless: true });
  let sessionClient;
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const selector of ['.home-stat.home-members-link', '.home-trust-people']) {
      await page.goto(base);
      await page.locator(selector).click();
      await page.waitForURL('**/signup?role=employer&returnTo=%2Fmembers');
      await page.getByRole('heading', { name: 'Create your employer account' }).waitFor();
      assert.equal(await page.getByRole('link', { name: /^Sign in$/ }).getAttribute('href'), '/login?returnTo=%2Fmembers');
    }
    await page.screenshot({ path: '/tmp/joblink-members-signup.png' });
    assert.deepEqual(errors, []);
    console.log('PASS mobile: both Members links open employer signup and retain sign-in destination');
    await page.close();

    // Explicit opt-in: existing, owner-authorized employer only. No email is sent,
    // no account/profile is created or changed, and this test session is revoked.
    if (process.env.MEMBERS_TEST_ACCOUNT === 'julianlaville@gmail.com') {
      const { createClient } = require('@supabase/supabase-js');
      const { createServerClient } = require('@supabase/ssr');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: account, error: accountError } = await admin.from('users').select('id,role,email_verified,is_banned').eq('email', process.env.MEMBERS_TEST_ACCOUNT).single();
      assert.equal(accountError, null);
      assert.ok(['employer', 'admin'].includes(account.role));
      assert.equal(account.email_verified, true);
      assert.notEqual(account.is_banned, true);
      const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: process.env.MEMBERS_TEST_ACCOUNT });
      assert.equal(error, null);
      assert.equal(data.user.id, account.id);
      const jar = new Map();
      sessionClient = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: cookies => cookies.forEach(({ name, value }) => jar.set(name, value)) } });
      const verified = await sessionClient.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
      assert.equal(verified.error, null);
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: base, sameSite: 'Lax' })));
      const employerPage = await context.newPage();
      for (const selector of ['.home-stat.home-members-link', '.home-trust-people']) {
        await employerPage.goto(base);
        await employerPage.locator(selector).click();
        if (account.role === 'employer') {
          await employerPage.waitForURL('**/browse-candidates');
          await employerPage.getByRole('heading', { name: /browse candidates/i }).waitFor();
        } else {
          await employerPage.waitForURL('**/members');
          await employerPage.getByRole('heading', { name: 'Browse candidates with an employer account' }).waitFor().catch(async error => {
            console.log('Authenticated gate diagnostics:', new URL(employerPage.url()).pathname, await employerPage.locator('h1').allTextContents());
            throw error;
          });
          assert.equal(await employerPage.getByRole('button', { name: 'Set up employer access' }).count(), 0);
        }
      }
      console.log(`PASS existing ${account.role}: both Members links respect account access without changing its role`);
      await context.close();
    }
  } finally {
    if (sessionClient) await sessionClient.auth.signOut({ scope: 'local' });
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
