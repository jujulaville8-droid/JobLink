// Run against a production build configured for talent-fixture.mjs only.
// Uses the same Playwright library as the existing browser scripts.
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');

const checkTalentPreview = async (page) => {
  const base = 'http://127.0.0.1:4319';
  const results = [];
  const check = (value, message) => { if (!value) throw new Error(message); results.push(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/_vercel/insights/script.js') return route.fulfill({ contentType: 'application/javascript', body: '' });
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await page.context().clearCookies();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(base);
  const section = page.locator('section[aria-labelledby="talent-preview-title"]');
  const track = section.locator('.animate-marquee').first();
  const signup = section.getByRole('link', { name: 'Create employer account' });
  const control = section.locator('button[aria-controls=talent-preview-illustration]');
  await control.waitFor();
  await section.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  check(await signup.getAttribute('href') === '/signup?role=employer&returnTo=%2Fmembers', 'Anonymous CTA preserves employer intent and guarded return');
  check(await section.locator('#talent-preview-illustration').evaluate(el => getComputedStyle(el).filter) === 'blur(3px)', 'Frosted preview blur is applied in the production build');
  check((await section.innerText()).includes('Create an employer account to browse candidates'), 'Positive employer-access caption is visible');
  check(!requests.some(url => /seeker_profiles|cv-download|cv\/export|browse-candidates/.test(url)), 'Anonymous browser makes no candidate/CV requests');
  check(!(await page.content()).includes('PRIVATE_CANDIDATE_CANARY'), 'Anonymous HTML and RSC contain no private candidate canary');
  check(await track.evaluate(el => getComputedStyle(el).animationPlayState) === 'running', 'Animation starts after hydration');
  const before = await track.evaluate(el => getComputedStyle(el).transform);
  await page.waitForTimeout(250);
  check(await track.evaluate(el => getComputedStyle(el).transform) !== before, 'Carousel moves');
  await control.click();
  await page.mouse.move(0, 0);
  await control.evaluate(el => el.blur());
  check(await control.getAttribute('aria-pressed') === 'true', 'Pause state is exposed accessibly');
  const paused = await track.evaluate(el => getComputedStyle(el).transform);
  await page.waitForTimeout(200);
  check(await track.evaluate(el => getComputedStyle(el).transform) === paused, 'Pause persists outside hover and focus');
  await control.click();
  await page.mouse.move(0, 0);
  await control.evaluate(el => el.blur());
  check(await track.evaluate(el => getComputedStyle(el).animationPlayState) === 'running', 'Resume restarts animation');
  await signup.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  check(await track.evaluate(el => getComputedStyle(el).animationPlayState) === 'paused', 'Keyboard focus pauses movement');
  check(await signup.evaluate(el => getComputedStyle(el).outlineStyle) !== 'none', 'Signup has a visible keyboard focus outline');
  await page.keyboard.press('Tab');
  check(await section.getByRole('link', { name: 'Sign in to view candidates' }).evaluate(el => el === document.activeElement), 'Keyboard moves directly to sign-in, skipping decorative cards');
  await page.keyboard.press('Tab');
  check(await control.evaluate(el => el === document.activeElement), 'Pause control follows sign-in in keyboard order');
  await page.keyboard.press('Space');
  check(await control.getAttribute('aria-pressed') === 'true', 'Space operates the pause toggle');

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await section.scrollIntoViewIfNeeded();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
    check(await page.locator('.home-employer-actions > a').evaluate(el => {
      const link = el.getBoundingClientRect();
      const card = el.closest('.home-employer-steps').getBoundingClientRect();
      return link.left >= card.left && link.right <= card.right && link.top >= card.top && link.bottom <= card.bottom;
    }), `Employer signup stays inside its card at ${width}px`);
    check(await signup.isVisible() && await control.isVisible(), `Signup and pause usable at ${width}px`);
    if (width === 390 || width === 1440) await section.screenshot({ path: `output/playwright/talent-preview-${width}.png` });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check(await track.evaluate(el => getComputedStyle(el).animationName) === 'none', 'Reduced motion disables the carousel');
  check(!(await control.isVisible()), 'Inapplicable motion control is hidden for reduced motion');
  check(await signup.isVisible(), 'Reduced motion keeps the signup CTA visible');
  await page.setViewportSize({ width: 390, height: 844 });
  await signup.click();
  await page.waitForURL('**/signup?role=employer&returnTo=%2Fmembers');
  await page.getByRole('heading', { name: 'Create your employer account' }).waitFor();
  check(true, 'Mobile CTA opens the employer signup screen');
  check(await page.getByRole('link', { name: 'Sign in', exact: true }).getAttribute('href') === '/login?returnTo=%2Fmembers', 'Signup keeps return destination for existing employers');
  await page.goto(base + '/members');
  await page.waitForURL('**/signup?role=employer&returnTo=%2Fmembers');
  check(true, 'Anonymous direct gateway redirects to employer signup');
  await page.goto(base + '/browse-candidates');
  await page.waitForURL('**/login');
  check(!(await page.content()).includes('PRIVATE_CANDIDATE_CANARY'), 'Anonymous direct directory access reveals no profile');
  const apiResponse = await page.request.get(base + '/api/cv-download?profileId=20000000-0000-0000-0000-000000000000');
  check(apiResponse.status() === 401, 'Anonymous CV endpoint requires authentication');

  async function fixtureSession(role) {
    await page.context().clearCookies();
    const value = await page.evaluate(role => {
      const encode = text => btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
      const now = Math.floor(Date.now() / 1000);
      const id = '40000000-0000-0000-0000-000000000000';
      const access_token = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + encode(JSON.stringify({ sub: id, role: 'authenticated', fixture_role: role, exp: now + 3600, iat: now })) + '.bG9jYWwtZml4dHVyZQ';
      return 'base64-' + encode(JSON.stringify({ access_token, refresh_token: 'local-only-refresh', token_type: 'bearer', expires_at: now + 3600, expires_in: 3600,
        user: { id, email: role + '@example.invalid', email_confirmed_at: role === 'unverified' ? null : '2026-01-01T00:00:00Z', role: 'authenticated', aud: 'authenticated', user_metadata: { role: role === 'seeker' ? 'seeker' : 'employer' } } }));
    }, role);
    await page.context().addCookies([{ name: 'sb-127-auth-token', value, url: base, sameSite: 'Lax' }]);
    await page.goto(base);
  }
  await fixtureSession('seeker');
  await section.getByRole('link', { name: 'Employer access', exact: true }).waitFor();
  await section.getByRole('link', { name: 'Employer access', exact: true }).click();
  await page.getByRole('heading', { name: 'Browse candidates with an employer account' }).waitFor();
  check(!(await page.content()).includes('PRIVATE_CANDIDATE_CANARY'), 'Seeker sees the existing account gate without candidate data');
  await page.goto(base + '/browse-candidates');
  await page.waitForURL(base + '/');
  check(true, 'Seeker direct directory URL is denied by server');
  await fixtureSession('employer');
  await section.getByRole('link', { name: 'View candidates', exact: true }).waitFor();
  check(!(await page.content()).includes('PRIVATE_CANDIDATE_CANARY'), 'Even authenticated homepage contains only illustrative cards');
  await section.getByRole('link', { name: 'View candidates', exact: true }).click();
  await page.waitForURL('**/browse-candidates');
  await page.getByRole('heading', { name: 'Browse Candidates', exact: true }).waitFor();
  await page.getByText('PRIVATE_CANDIDATE_CANARY FIXTURE', { exact: true }).waitFor();
  check((await page.content()).includes('PRIVATE_CANDIDATE_CANARY'), 'Verified employer follows gateway to real directory code (synthetic fixture only)');
  await fixtureSession('unverified');
  await page.goto(base + '/members');
  await page.waitForURL('**/verify-email?returnTo=%2Fmembers');
  check(!(await page.content()).includes('PRIVATE_CANDIDATE_CANARY'), 'Unverified employer must verify before directory access');
  await fixtureSession('banned');
  await page.goto(base + '/members');
  await page.waitForURL('**/?suspended=1');
  check(!(await page.content()).includes('PRIVATE_CANDIDATE_CANARY'), 'Banned employer is denied by the gateway');
  const noJsContext = await page.context().browser().newContext({ javaScriptEnabled: false, bypassCSP: true });
  try {
    const noJsPage = await noJsContext.newPage();
    await noJsContext.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await noJsPage.goto(base);
    const noJsSection = noJsPage.locator('section[aria-labelledby="talent-preview-title"]');
    check(await noJsSection.getByRole('link', { name: 'Create employer account' }).isVisible(), 'Signup content is usable without JavaScript');
    check(await noJsSection.locator('.animate-marquee').first().evaluate(el => getComputedStyle(el).animationPlayState) === 'paused', 'No-JavaScript preview stays still');
    check(await noJsSection.getByRole('button').count() === 0, 'No inactive pause control is rendered without JavaScript');
    await noJsSection.getByRole('link', { name: 'Create employer account' }).click();
    check(new URL(noJsPage.url()).pathname === '/signup', 'Signup link works without JavaScript');
  } finally { await noJsContext.close(); }
  check(errors.length === 0, 'No browser runtime errors');
  return { passed: results.length, checks: results };
};

(async () => {
  mkdirSync('output/playwright', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    // Local fixture HTTP is outside the app's unchanged production CSP.
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    console.log(JSON.stringify(await checkTalentPreview(page), null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
