const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const ORIGIN = 'http://127.0.0.1:4196';
const OUTPUT = process.env.APPLICATION_COMPLETION_OUTPUT;
if (!OUTPUT) throw new Error('Set APPLICATION_COMPLETION_OUTPUT to an artifact directory outside the repository.');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '55555555-5555-4555-8555-555555555555';
const JOB = '22222222-2222-4222-8222-222222222222';
const OTHER_JOB = '33333333-3333-4333-8333-333333333333';
const APPLY = `/jobs/${JOB}/apply`;
const PROFILE = `/profile?returnTo=${encodeURIComponent(APPLY)}`;
const PREFIX = 'joblink.application-draft.v1:';
const report = { scope: 'Actual React components in a local Vite fixture; synthetic auth, database, profile/resume saves and application responses. No real Supabase session, live submission or email.', results: [], screenshots: [], consoleErrors: [], pageErrors: [], blockedExternalRequests: [], sourceHashes: {}, fixtureHashes: {} };
report.contrastChecks = [];
report.reproduction = {
  server: './node_modules/.bin/vite --config tests/browser/application-completion-vite.config.ts',
  runner: 'node tests/browser/check-application-completion.cjs',
  environment: { PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE, TEST_BROWSER_EXECUTABLE: process.env.TEST_BROWSER_EXECUTABLE, APPLICATION_COMPLETION_OUTPUT: OUTPUT },
};
fs.mkdirSync(OUTPUT, { recursive: true });
const sourceFiles = [
  'src/components/home/HomeHeader.tsx', 'src/app/jobs/[id]/apply/page.tsx',
  'src/components/ApplicationDraftControls.tsx', 'src/lib/application-drafts.ts',
  'src/app/(dashboard)/profile/page.tsx', 'src/components/cv/studio/ResumeStudio.tsx', 'src/lib/return-to.ts',
];
for (const file of sourceFiles) report.sourceHashes[file] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fixtureFiles = ['application-completion-vite.config.ts', 'application-completion-stubs.tsx', 'application-completion.tsx', 'application-completion-image.tsx', 'application-completion.html', 'check-application-completion.cjs'];
for (const file of fixtureFiles) report.fixtureHashes[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join('tests/browser', file))).digest('hex');

function passed(width, test) { report.results.push({ width, test, passed: true }); console.log(`PASS ${width}px ${test}`); }
async function screenshot(page, name) {
  // Motion's JavaScript entrance animations can still be transparent after a
  // Playwright visibility check. Capture the settled UI rather than that frame.
  await page.waitForFunction(() => {
    let element = document.querySelector('h1');
    while (element) {
      if (Number(getComputedStyle(element).opacity) < 0.99) return false;
      element = element.parentElement;
    }
    return true;
  });
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[style]')).every(element => {
    const scale = element instanceof HTMLElement ? element.style.transform.match(/^scale\(([-\d.]+)\)$/) : null;
    return !scale || Math.abs(Number(scale[1]) - 1) < 0.01;
  }));
  await page.screenshot({ path: path.join(OUTPUT, name), fullPage: true, animations: 'disabled' });
  report.screenshots.push(name);
}
async function contrast(locator) {
  return locator.evaluate(element => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    const ancestors = [];
    for (let node = element; node; node = node.parentElement) ancestors.unshift(node);
    context.fillStyle = '#fff'; context.fillRect(0, 0, 1, 1);
    for (const node of ancestors) { context.fillStyle = getComputedStyle(node).backgroundColor; context.fillRect(0, 0, 1, 1); }
    const background = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1);
    const foreground = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    const luminance = rgb => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const light = Math.max(luminance(background), luminance(foreground));
    const dark = Math.min(luminance(background), luminance(foreground));
    const hex = rgb => `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`;
    return { foreground: hex(foreground), background: hex(background), ratio: (light + 0.05) / (dark + 0.05) };
  });
}
async function noOverflow(page, name) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.width, `${name}: ${JSON.stringify(dimensions)}`);
}
async function visiblyRendered(page, locator) {
  await locator.waitFor({ state: 'visible' });
  const handle = await locator.elementHandle();
  try {
    await page.waitForFunction(target => {
      if (!target?.isConnected || !target.getClientRects().length) return false;
      let element = target;
      while (element) {
        const style = getComputedStyle(element);
        if (Number(style.opacity) < 0.99 || style.visibility === 'hidden') return false;
        element = element.parentElement;
      }
      return true;
    }, handle);
  } finally { await handle?.dispose(); }
}
async function go(page, pathname) { await page.goto(`${ORIGIN}${pathname}`); }
async function reset(page, options = {}) { await page.evaluate(options => window.__completionFixture.reset(options), options); }
async function configure(page, options) { await page.evaluate(options => window.__completionFixture.configure(options), options); }
async function snapshot(page) { return page.evaluate(() => window.__completionFixture.snapshot()); }
async function drafts(page) { return page.evaluate(prefix => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith(prefix))), PREFIX); }
async function ready(page) {
  await visiblyRendered(page, page.getByRole('heading', { name: 'Submit Your Application', exact: true }));
  await visiblyRendered(page, page.getByRole('textbox', { name: 'Cover letter', exact: true }));
}
async function editProfile(page) {
  await page.getByRole('heading', { name: 'About', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
}
function assertNoApplicationRequests(state) { assert.equal(state.requests.filter(request => request.path === '/api/jobs/apply').length, 0); }

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.TEST_BROWSER_EXECUTABLE || undefined, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === ORIGIN || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
        report.blockedExternalRequests.push(url.href);
        return route.abort('blockedbyclient');
      });
      await context.routeWebSocket('**/*', socket => {
        const url = new URL(socket.url());
        if (url.hostname === '127.0.0.1' && url.port === '4196') socket.connectToServer();
        else { report.blockedExternalRequests.push(url.href); socket.close(); }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => report.pageErrors.push({ width, message: error.message }));
      page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ width, message: message.text() }); });
      await go(page, '/');
      await page.getByRole('heading', { name: 'Synthetic browser fixture' }).waitFor();

      // Exercise actual responsive navigation, including keyboard menu activation.
      if (width < 701) {
        const toggle = page.getByRole('button', { name: 'Open menu' });
        await toggle.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('navigation', { name: 'Mobile navigation' }).waitFor();
      }
      const region = width < 701 ? page.getByRole('navigation', { name: 'Mobile navigation' }) : page.locator('.home-header-actions');
      for (const [role, signedIn, labels] of [
        [null, false, ['Sign in', 'Create employer account']],
        ['employer', true, ['Dashboard', 'Post a job']],
        ['seeker', true, ['Dashboard']], ['admin', true, ['Dashboard']], [null, true, ['Dashboard']],
      ]) {
        await configure(page, { role, user: signedIn ? { id: USER, email: 'jamie@example.test' } : null });
        for (const label of labels) assert.equal(await region.getByRole('link', { name: label, exact: true }).count(), 1);
        assert.equal(await region.getByRole('link').count(), labels.length + (width < 701 ? 3 : 0));
        await noOverflow(page, `header ${role}`);
        passed(width, `header ${signedIn ? role || 'unresolved role' : 'guest'} unique actions`);
      }
      await screenshot(page, `header-${width}.png`);

      // Incomplete application -> save profile -> return to the same job without submitting.
      await reset(page);
      let state = await snapshot(page);
      await configure(page, { profile: { ...state.profile, phone: '' } });
      await go(page, APPLY);
      await visiblyRendered(page, page.getByRole('heading', { name: 'Complete Your Profile' }));
      await visiblyRendered(page, page.getByText('Phone number', { exact: true }));
      await noOverflow(page, 'incomplete application');
      await screenshot(page, `apply-incomplete-${width}.png`);
      const complete = page.getByRole('link', { name: 'Complete Profile', exact: true });
      assert.equal(await complete.getAttribute('href'), PROFILE);
      await complete.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(`${ORIGIN}${PROFILE}`);
      assert.equal(await page.getByRole('link', { name: 'Return to application', exact: true }).getAttribute('href'), APPLY);
      await editProfile(page);
      await page.getByPlaceholder('+1 (268) 555-0123').fill('+1 268 555 0199');
      await noOverflow(page, 'profile editor');
      await screenshot(page, `profile-edit-${width}.png`);
      await page.getByRole('button', { name: 'Save and return to application', exact: true }).click();
      await page.waitForURL(`${ORIGIN}${APPLY}`);
      await ready(page);
      state = await snapshot(page);
      assert.equal(state.profile.phone, '+1 268 555 0199');
      assertNoApplicationRequests(state);
      passed(width, 'incomplete application -> saved profile -> original application, no submission');

      // A successful but incomplete save stays editable.
      await reset(page);
      state = await snapshot(page);
      await configure(page, { profile: { ...state.profile, phone: '' } });
      await go(page, PROFILE);
      await editProfile(page);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByText('Profile saved. Still needed to apply: Phone number.', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/profile');
      assert.equal(await page.getByRole('heading', { name: 'Edit Profile' }).count(), 1);
      assertNoApplicationRequests(await snapshot(page));
      await noOverflow(page, 'incomplete saved profile');
      passed(width, 'incomplete saved profile stays editable');

      // A failed save retains the user's edits and application context.
      await configure(page, { profileFailure: true });
      await page.getByPlaceholder('+1 (268) 555-0123').fill('+1 268 555 0188');
      await page.getByRole('button', { name: 'Save and return to application', exact: true }).click();
      await page.getByText('Synthetic profile save failed. Please try again.', { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('+1 (268) 555-0123').inputValue(), '+1 268 555 0188');
      assert.equal(new URL(page.url()).pathname, '/profile');
      assertNoApplicationRequests(await snapshot(page));
      passed(width, 'failed profile save retains edits and stays on profile');

      // Existing built resumes satisfy the alternative to an uploaded resume.
      await reset(page);
      state = await snapshot(page);
      await configure(page, { builtResume: true, profile: { ...state.profile, cv_url: '' } });
      await go(page, APPLY);
      await ready(page);
      await go(page, PROFILE);
      await editProfile(page);
      await page.getByRole('button', { name: '3', exact: true }).click();
      await page.getByText(/Your built resume meets the resume requirement/).waitFor();
      await page.getByRole('button', { name: 'Save and return to application', exact: true }).click();
      await page.waitForURL(`${ORIGIN}${APPLY}`);
      await ready(page);
      assertNoApplicationRequests(await snapshot(page));
      passed(width, 'built resume accepted without uploaded CV');

      // Alternative builder saves profile edits first and retains the return links.
      await reset(page);
      state = await snapshot(page);
      await configure(page, { profile: { ...state.profile, cv_url: '' } });
      await go(page, PROFILE);
      await editProfile(page);
      await page.getByPlaceholder('John', { exact: true }).fill('Jamie Builder');
      await page.getByRole('button', { name: '3', exact: true }).click();
      await page.getByRole('button', { name: 'Save profile and build a resume instead', exact: true }).click();
      await page.waitForURL(`${ORIGIN}/profile/cv?returnTo=${encodeURIComponent(APPLY)}`);
      const summary = page.getByRole('textbox', { name: 'Professional summary', exact: true });
      await summary.waitFor();
      assert.equal((await snapshot(page)).profile.first_name, 'Jamie Builder');
      assert.equal(await page.getByRole('link', { name: 'Back to profile', exact: true }).getAttribute('href'), PROFILE);
      await summary.fill('Synthetic browser QA resume summary.');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'All changes saved' }).waitFor();
      await noOverflow(page, 'resume builder');
      await screenshot(page, `resume-return-${width}.png`);
      await page.getByRole('button', { name: 'Personal details', exact: true }).click();
      assert.equal(await page.getByRole('link', { name: 'Edit personal details', exact: true }).getAttribute('href'), PROFILE);
      await page.getByRole('link', { name: 'Back to profile', exact: true }).click();
      await page.getByRole('link', { name: 'Return to application', exact: true }).click();
      await ready(page);
      assertNoApplicationRequests(await snapshot(page));
      passed(width, 'profile -> actual resume builder -> profile -> original application');

      // Draft persistence requires an explicit action and never auto-restores.
      await reset(page);
      await go(page, APPLY);
      await ready(page);
      let letter = page.getByRole('textbox', { name: 'Cover letter', exact: true });
      await letter.fill('Typed but never saved.');
      assert.deepEqual(await drafts(page), {});
      await page.reload();
      await ready(page);
      assert.equal(await letter.inputValue(), '');
      assert.deepEqual(await drafts(page), {});
      passed(width, 'typing does not persist across reload');

      await letter.fill('My explicitly saved synthetic cover letter.');
      await letter.focus();
      await page.keyboard.press('Tab');
      const save = page.getByRole('button', { name: 'Save draft on this device', exact: true });
      assert.equal(await save.evaluate(element => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      await page.getByRole('status').filter({ hasText: 'Draft saved on this device.' }).waitFor();
      assert.equal(Object.keys(await drafts(page)).length, 1);
      await page.getByRole('link', { name: 'Back to job listing', exact: true }).click();
      await go(page, APPLY);
      await ready(page);
      await page.reload();
      await ready(page);
      assert.equal(await letter.inputValue(), '');
      await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
      assert.equal(await letter.inputValue(), 'My explicitly saved synthetic cover letter.');
      await noOverflow(page, 'saved draft form');
      await screenshot(page, `draft-resumed-${width}.png`);
      for (const [control, locator] of [
        ['privacy text', page.locator('#draft-privacy')],
        ['saved draft notice', page.getByText('A saved draft is available for this job. Choose Resume draft to load it.', { exact: true })],
        ['delete saved draft', page.getByRole('button', { name: 'Delete saved draft', exact: true })],
      ]) {
        const colors = await contrast(locator);
        report.contrastChecks.push({ width, control, ...colors });
        assert.ok(colors.ratio >= 4.5, `${control} contrast ${colors.ratio.toFixed(2)}:1`);
      }
      passed(width, 'keyboard save, navigate away, reload, explicit resume only');

      await letter.fill('My current unsaved replacement.');
      page.once('dialog', dialog => dialog.dismiss());
      await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
      assert.equal(await letter.inputValue(), 'My current unsaved replacement.');
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
      assert.equal(await letter.inputValue(), 'My explicitly saved synthetic cover letter.');
      await letter.fill('Keep this current text after deleting the saved draft.');
      await page.getByRole('button', { name: 'Delete saved draft', exact: true }).click();
      assert.equal(await letter.inputValue(), 'Keep this current text after deleting the saved draft.');
      assert.deepEqual(await drafts(page), {});
      passed(width, 'dirty resume requires confirmation; deleting draft preserves current text');

      await save.click();
      const savedBeforeFailure = await drafts(page);
      await configure(page, { submitFailure: true });
      await page.getByRole('button', { name: 'Submit Application', exact: true }).click();
      await visiblyRendered(page, page.getByText('Submission Failed', { exact: true }));
      assert.deepEqual(await drafts(page), savedBeforeFailure);
      await noOverflow(page, 'submission failure');
      await screenshot(page, `synthetic-submission-failure-${width}.png`);
      await page.getByRole('button', { name: 'Try Again', exact: true }).click();
      await ready(page);
      assert.equal(await letter.inputValue(), 'Keep this current text after deleting the saved draft.');
      await configure(page, { submitFailure: false });
      await page.getByRole('button', { name: 'Submit Application', exact: true }).click();
      await visiblyRendered(page, page.getByRole('heading', { name: 'Application Submitted!', exact: true }));
      assert.deepEqual(await drafts(page), {});
      state = await snapshot(page);
      assert.equal(state.requests.filter(request => request.path === '/api/jobs/apply').length, 2);
      assert.equal(state.applied.length, 1);
      await noOverflow(page, 'application success');
      await screenshot(page, `synthetic-submission-success-${width}.png`);
      passed(width, 'synthetic failed submission preserves draft; synthetic success clears it');

      // A server-side duplicate race clears the local draft and visibly stops submission.
      await reset(page, { submitDuplicate: true });
      await go(page, APPLY);
      await ready(page);
      await letter.fill('Synthetic draft for a duplicate application response.');
      await save.click();
      assert.equal(Object.keys(await drafts(page)).length, 1);
      await page.getByRole('button', { name: 'Submit Application', exact: true }).click();
      await visiblyRendered(page, page.getByRole('heading', { name: 'Already Applied', exact: true }));
      await noOverflow(page, 'duplicate application');
      await screenshot(page, `synthetic-duplicate-${width}.png`);
      assert.deepEqual(await drafts(page), {});
      assert.equal(await page.getByRole('button', { name: 'Submit Application', exact: true }).count(), 0);
      state = await snapshot(page);
      assert.equal(state.requests.filter(request => request.path === '/api/jobs/apply').length, 1);
      assert.equal(state.applied.length, 0);
      passed(width, 'synthetic 409 visibly stops submission, clears draft, sends exactly one request');

      // Changing the job or account never restores another form's private text.
      await reset(page);
      await go(page, APPLY);
      await ready(page);
      await letter.fill('Private text for the first synthetic account and job.');
      await save.click();
      await go(page, `/jobs/${OTHER_JOB}/apply`);
      await ready(page);
      assert.equal(await letter.inputValue(), '');
      assert.equal(await page.getByRole('button', { name: 'Resume draft', exact: true }).count(), 0);
      await go(page, APPLY);
      await ready(page);
      assert.equal(await letter.inputValue(), '');
      await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
      assert.match(await letter.inputValue(), /^Private text/);
      await configure(page, { user: { id: OTHER_USER, email: 'other@example.test' } });
      await ready(page);
      assert.equal(await letter.inputValue(), '');
      assert.equal(await page.getByRole('button', { name: 'Resume draft', exact: true }).count(), 0);
      assert.deepEqual(await drafts(page), {});
      passed(width, 'other job/account never loads saved or in-memory cover letter');
      await context.close();
    }
    assert.deepEqual(report.blockedExternalRequests, [], 'No external requests attempted');
    assert.deepEqual(report.pageErrors, [], 'No browser runtime errors');
    assert.deepEqual(report.consoleErrors, [], 'No browser console errors');
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.failure = error.stack || String(error);
    const failedPage = browser.contexts().flatMap(context => context.pages()).at(-1);
    if (failedPage) {
      await failedPage.screenshot({ path: path.join(OUTPUT, 'failure.png'), fullPage: true });
      report.failureStyles = await failedPage.locator('[style]').evaluateAll(elements => elements.map(element => ({ tag: element.tagName, style: element.getAttribute('style'), text: element.textContent?.slice(0, 120), opacity: getComputedStyle(element).opacity })));
    }
    console.error(report.failure);
    process.exitCode = 1;
  } finally {
    report.completedAt = new Date().toISOString();
    for (const file of sourceFiles) {
      const current = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (current !== report.sourceHashes[file]) { report.sourceChangedDuringRun = true; report.passed = false; process.exitCode = 1; }
    }
    fs.writeFileSync(path.join(OUTPUT, 'application-completion-browser-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
    console.log(`${report.results.length} checks passed; report: ${path.join(OUTPUT, 'application-completion-browser-report.json')}`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
