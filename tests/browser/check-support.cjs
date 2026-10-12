/* Run against support-vite.config.ts. All delivery is intercepted, never sent. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const base = process.env.SUPPORT_BASE_URL || 'http://127.0.0.1:4357';
  const out = resolve(process.env.EVIDENCE_DIR || '/tmp/joblink-support-evidence');
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const results = [];
  try {
    for (const width of [320, 390, 1440]) {
      for (const scheme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, colorScheme: scheme, reducedMotion: 'reduce' });
        const errors = [], submissions = [];
        let accept = false;
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        await page.route('**/api/support', async route => {
          const payload = route.request().postDataJSON();
          submissions.push(payload);
          await new Promise(done => setTimeout(done, 200));
          await route.fulfill({ status: accept ? 200 : 503, contentType: 'application/json', body: JSON.stringify(accept ? { success: true, reference: payload.id } : { error: 'TEST: Support is unavailable. Your draft is still here.' }) });
        });
        await page.goto(`${base}/tests/browser/support.html`);
        const trigger = page.getByRole('button', { name: 'Support', exact: true });
        const triggerBounds = await trigger.boundingBox();
        assert(triggerBounds.width >= 44 && triggerBounds.height >= 44);
        if (width < 768) assert(triggerBounds.y + triggerBounds.height <= 844 - 76, 'Trigger covers mobile navigation');
        await trigger.focus(); await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog', { name: 'Contact support' });
        await dialog.waitFor({ state: 'visible' });
        assert(await page.getByRole('button', { name: 'Close support' }).evaluate(el => document.activeElement === el), 'Initial focus missing');
        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');
          assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'Keyboard focus escaped modal');
        }
        await page.keyboard.press('Shift+Tab');
        assert(await dialog.evaluate(el => el.contains(document.activeElement)));
        await page.getByLabel('Your name', { exact: true }).fill('Test Visitor');
        await page.getByLabel('Reply email', { exact: true }).fill('visitor@example.test');
        await page.getByLabel('Message', { exact: true }).fill('TEST ONLY: I need help with my account.');
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        assert.equal(submissions.length, 0, 'Consent bypassed');
        await page.getByRole('checkbox').check();
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]'));
        // Dispatch duplicate submit while pending; the component's ref must block it.
        await dialog.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
        await page.getByRole('alert').waitFor();
        assert.equal(submissions.length, 1, 'Duplicate submitted');
        assert.equal(await page.getByLabel('Message', { exact: true }).count(), 1, 'Message label changed after filling');
        assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'TEST ONLY: I need help with my account.');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert(await trigger.evaluate(el => document.activeElement === el), 'Focus not restored');
        assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'Scroll lock not released');
        await trigger.click();
        assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'TEST ONLY: I need help with my account.');
        const geometry = await dialog.evaluate(el => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, pageWidth: document.documentElement.scrollWidth, windowWidth: innerWidth, windowHeight: innerHeight };
        });
        assert(geometry.left >= 0 && geometry.right <= width && geometry.top >= 0 && geometry.bottom <= 844);
        assert(geometry.scrollWidth <= geometry.clientWidth && geometry.pageWidth <= width, 'Horizontal overflow');
        await page.screenshot({ path: resolve(out, `support-${width}-${scheme}.png`) });
        accept = true;
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        await page.getByRole('status').waitFor();
        assert.deepEqual(submissions[0], submissions[1], 'Retry changed identity/content');
        assert.match(await page.getByRole('status').innerText(), /does not confirm inbox delivery/);
        await page.getByRole('button', { name: 'Write another message' }).click();
        assert.equal(await page.getByLabel('Your name', { exact: true }).inputValue(), '');
        assert.equal(await page.getByLabel('Reply email', { exact: true }).inputValue(), '');
        assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), '');
        assert.equal(await page.getByRole('checkbox').isChecked(), false);
        await page.getByRole('button', { name: 'Close support' }).click();
        assert.equal(errors.length, 0, errors.join('\n'));
        results.push({ width, scheme, pass: true, submissions: submissions.length, geometry, errors });
        console.log(`PASS ${width} ${scheme}: focus, Escape, mobile layout, consent, failure, retry, duplicate guard, receipt`);
        await page.close();
      }
    }
  } finally { await browser.close(); writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
