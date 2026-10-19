/* Call the exported function with a Playwright Page. For Playwright MCP,
   supply the function expression as code and call it with page.
   Uses actual UI with synthetic local data only. */
module.exports = async function checkJobDiscovery(page) {
  const origin = 'http://127.0.0.1:4198';
  const job = '/jobs/22222222-2222-4222-8222-222222222222';
  const results = [], errors = [], externalRequests = [], writes = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request();
    if (request.method() !== 'GET') { writes.push(request.url()); return route.abort(); }
    if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) { externalRequests.push(request.url()); return route.abort(); }
    return route.continue();
  });
  for (const width of [320, 375, 390, 414, 430, 768, 1024, 1440]) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion });
      await page.goto(`${origin}${job}`);
      await page.locator('[data-mobile-apply]').waitFor({ state: 'attached' });
      await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
      await page.waitForTimeout(100);
      const samples = [];
      for (const scroll of [0, 0.5, 1]) {
        await page.evaluate(fraction => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * fraction); }, scroll);
        await page.waitForTimeout(30);
        const sample = await page.evaluate(() => {
          const bar = document.querySelector('[data-mobile-apply]');
          const nav = document.querySelector('nav[data-support-obstruction]');
          const support = document.querySelector('button[aria-label="Support"]');
          const rect = element => element.getBoundingClientRect().toJSON();
          let parent = bar.parentElement;
          const transforms = [];
          while (parent) { if (getComputedStyle(parent).transform !== 'none') transforms.push(getComputedStyle(parent).transform); parent = parent.parentElement; }
          return { bar: rect(bar), nav: rect(nav), support: rect(support), transforms, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, scrollY, animation: getComputedStyle(document.querySelector('.animate-fade-up')).animationName };
        });
        check(sample.scrollWidth <= width, `${width}px horizontal overflow`);
        check(sample.transforms.length === 0, `${width}px fixed bar has transformed ancestor`);
        if (width < 1024) {
          check(sample.bar.top >= 0 && sample.bar.bottom <= 844, `${width}px Apply outside viewport`);
          if (width < 768) check(sample.bar.bottom <= sample.nav.top, `${width}px Apply overlaps bottom navigation`);
          check(sample.support.bottom + 8 <= sample.bar.top, `${width}px support overlaps Apply`);
          check(sample.support.top >= 0, `${width}px support outside viewport`);
        } else check(sample.bar.height === 0, 'Desktop mobile bar must be hidden');
        if (reducedMotion === 'reduce') check(sample.animation === 'none', 'Reduced motion still has entrance animation');
        samples.push(sample);
      }
      if (width < 1024) check(samples.every(sample => sample.bar.top === samples[0].bar.top), `${width}px Apply moved during scroll`);
      await page.getByRole('button', { name: 'Support', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      const bounds = await dialog.boundingBox();
      check(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 844, `${width}px support dialog clipped`);
      await page.getByRole('button', { name: 'Close support', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      if (width < 1024) {
        await page.locator('[data-mobile-apply] a').click();
        await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
        const loginUrl = new URL(page.url());
        check(loginUrl.searchParams.get('returnTo') === `${job}/apply`, 'Apply lost login destination');
        await page.getByRole('link', { name: 'Create one', exact: true }).click();
        await page.getByLabel('Email address', { exact: true }).waitFor();
        const signupUrl = new URL(page.url());
        check(signupUrl.searchParams.get('returnTo') === `${job}/apply`, 'Signup lost application destination');
        check(signupUrl.searchParams.get('role') === 'seeker', 'Signup did not preselect seeker');
        await page.getByRole('button', { name: /Google/ }).click();
        const oauth = await page.evaluate(() => window.fixtureOAuth);
        check(new URL(oauth.options.redirectTo).searchParams.get('returnTo') === `${job}/apply`, 'OAuth lost application destination');
      }
      results.push({ width, reducedMotion, checks: 'scroll top/middle/end, no transformed ancestor, viewport anchoring, nav/support clearance, reduced motion, support open/close, application login/signup/OAuth', samples });
    }
    await page.goto(`${origin}/jobs?q=chef&location=English+Harbour&job_type=full_time&job_type=part_time&page=4`);
    await page.getByRole('search').waitFor();
    if (width < 1024) await page.getByRole('button', { name: /^Filters/ }).click();
    const industry = page.getByLabel('Industry / Category').filter({ visible: true });
    check(await industry.count() === 1, `${width}px visible industry label/select association missing`);
    const current = page.getByRole('link', { name: 'Page 4', exact: true });
    check(await current.getAttribute('aria-current') === 'page', 'Pagination current page missing');
    check(await page.getByRole('link', { name: 'Next page' }).count() === 1, 'Next page unnamed');
    check(await page.getByRole('link', { name: 'Previous page' }).count() === 1, 'Previous page unnamed');
    const signup = new URL(await page.getByRole('link', { name: 'Create account to set up an alert' }).getAttribute('href'), origin);
    const search = new URL(signup.searchParams.get('returnTo'), origin);
    check(search.searchParams.get('location') === 'English Harbour', 'Alert signup dropped location');
    check(search.searchParams.getAll('job_type').length === 2, 'Alert signup dropped a selected job type');
    check(await page.getByText(/Location and company-name matching are not supported/).count() === 1, 'Unsupported alert matching not explained');
    await page.getByLabel('Job location', { exact: true }).fill('  St.   Johns ');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('location') === 'St. Johns');
    check(new URL(page.url()).searchParams.get('page') === null, 'Location edit failed to reset page');
    check(new URL(page.url()).searchParams.get('q') === 'chef', 'Location edit dropped keyword');
    await page.getByRole('button', { name: 'Clear location', exact: true }).click();
    await page.waitForURL(url => !url.searchParams.has('location'));
    check(new URL(page.url()).searchParams.getAll('job_type').length === 2, 'Clear location dropped selected types');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px search overflows`);
    await page.goto(`${origin}/jobs?q=chef&location=English+Harbour`);
    await page.getByRole('search').waitFor();
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.textContent === 'Skip to main content'), 'Skip link not first keyboard stop');
    await page.keyboard.press('Enter');
    check(await page.evaluate(() => document.activeElement.id === 'main-content'), 'Skip link did not focus main');
    results.push({ width, checks: 'search editing/clearing, URL preservation, industry label/select, named pagination, alert limitations, skip-link keyboard focus', passed: true });
  }
  check(errors.length === 0, `Runtime errors: ${errors}`);
  check(writes.length === 0 && externalRequests.length === 0, 'Unexpected external requests or writes');
  return { passed: true, scope: 'Actual production components in local Vite fixture; synthetic anonymous auth/job; system font; no live session, OAuth provider, email, database write or delivery.', results, errors, writes, externalRequests };
};
