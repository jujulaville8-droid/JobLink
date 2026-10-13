/* Run against support-vite.config.ts. All delivery is intercepted, never sent. */
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const base = process.env.SUPPORT_BASE_URL || 'http://127.0.0.1:4357';
  const out = resolve(process.env.EVIDENCE_DIR || '/tmp/joblink-support-evidence');
  mkdirSync(out, { recursive: true });
  const browserType = process.env.SUPPORT_BROWSER === 'webkit' ? webkit : chromium;
  const browser = await browserType.launch({ headless: true, ...(browserType === chromium && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const results = [];
  try {
    for (const width of [320, 375, 390, 768, 1440]) {
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
        assert(Math.abs(triggerBounds.width - triggerBounds.height) < 1, 'Support entry is not a small chat bubble');
        assert(triggerBounds.width <= 64, 'Chat bubble is too large');
        if (width < 1024) {
          await page.evaluate(width => {
            const apply = document.createElement('div');
            apply.dataset.supportObstruction = '';
            apply.id = 'fixture-apply-bar';
            apply.textContent = 'Fixture essential Apply action';
            Object.assign(apply.style, { position: 'fixed', bottom: width < 768 ? '76px' : '0px', height: '64px', width: '100%', background: 'white' });
            document.body.append(apply);
          }, width);
          await page.waitForFunction(() => {
            const bubble = document.querySelector('button[aria-haspopup="dialog"]')?.getBoundingClientRect();
            const bar = document.querySelector('#fixture-apply-bar')?.getBoundingClientRect();
            return bubble && bar && bubble.bottom <= bar.top - 8;
          });
        }
        if (width < 768) assert(triggerBounds.y + triggerBounds.height <= 844 - 76, 'Trigger covers mobile navigation');
        await trigger.focus(); await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog', { name: 'JobLinks support' });
        await dialog.waitFor({ state: 'visible' });
        assert.match(await dialog.innerText(), /reply.*email/i);
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
        assert(geometry.right >= width - 32 && geometry.right <= width - 8, 'Panel is not anchored at the right edge');
        assert(geometry.right - geometry.left <= 390, 'Support panel is not compact');
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
        // Simulate a future consent banner and safe-area navigation enlargement.
        await page.evaluate(() => {
          const cookie = document.createElement('div'); cookie.dataset.supportObstruction = ''; cookie.id = 'fixture-cookie';
          Object.assign(cookie.style, { position: 'fixed', bottom: '0px', height: '180px', width: '100%' }); document.body.append(cookie);
        });
        await page.waitForFunction(() => document.querySelector('button[aria-haspopup="dialog"]').getBoundingClientRect().bottom <= document.querySelector('#fixture-cookie').getBoundingClientRect().top - 8);
        await page.evaluate(() => { document.querySelector('#fixture-cookie').remove(); document.querySelector('#fixture-apply-bar')?.remove(); });
        await trigger.click(); await dialog.waitFor({ state: 'visible' });
        await dialog.evaluate(el => {
          for (const node of el.querySelectorAll('h2, p, label, button, input, textarea')) node.style.fontSize = `${parseFloat(getComputedStyle(node).fontSize) * 2}px`;
        });
        assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), '200% text causes horizontal overflow');
        await page.getByRole('button', { name: 'Send message', exact: true }).scrollIntoViewIfNeeded();
        assert(await page.getByRole('button', { name: 'Send message', exact: true }).isVisible(), 'Primary action inaccessible at 200% text');
        await page.keyboard.press('Escape');
        assert.equal(errors.length, 0, errors.join('\n'));
        results.push({ width, scheme, pass: true, submissions: submissions.length, geometry, errors });
        console.log(`PASS ${width} ${scheme}: bubble, compact panel, focus, Escape, nav/apply/cookie clearance, 200% text, consent, failure, retry, duplicate guard, receipt`);
        await page.close();
      }
    }
    const keyboardPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await keyboardPage.addInitScript(() => {
      const viewport = new EventTarget();
      Object.assign(viewport, { height: 844, width: 390, offsetTop: 0 });
      window.supportTestViewport = viewport;
      Object.defineProperty(window, 'visualViewport', { value: viewport });
    });
    await keyboardPage.goto(`${base}/tests/browser/support.html?surface=home`);
    await keyboardPage.getByRole('button', { name: 'Support', exact: true }).click();
    const keyboardDialog = keyboardPage.getByRole('dialog', { name: 'JobLinks support' });
    await keyboardPage.getByLabel('Your name', { exact: true }).focus();
    for (const offsetTop of [0, 100]) {
      await keyboardPage.evaluate(offset => {
        window.supportTestViewport.height = 400; window.supportTestViewport.offsetTop = offset;
        window.supportTestViewport.dispatchEvent(new Event('resize'));
      }, offsetTop);
      await keyboardPage.waitForFunction(() => document.querySelector('button[aria-haspopup="dialog"]').getBoundingClientRect().bottom <= 400 + window.supportTestViewport.offsetTop);
      const bounds = await keyboardDialog.boundingBox();
      assert(bounds.height >= 200, 'Software keyboard collapses the support panel');
      assert(bounds.y >= offsetTop && bounds.y + bounds.height <= offsetTop + 400, 'Panel escapes visible keyboard viewport');
      await keyboardPage.getByRole('button', { name: 'Send message', exact: true }).scrollIntoViewIfNeeded();
      assert(await keyboardPage.getByRole('button', { name: 'Close support' }).isVisible(), 'Keyboard hides close control');
      results.push({ width: 390, mode: 'synthetic-keyboard', height: 400, offsetTop, pass: true, bounds });
      console.log(`PASS synthetic keyboard 400px offset=${offsetTop}: panel stays visible, form scrolls, close remains reachable`);
    }
    await keyboardPage.close();
    const preview = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await preview.goto(`${base}/tests/browser/support.html?surface=home`);
    assert.equal(await preview.getByRole('dialog').count(), 0, 'Support opened without a click');
    await preview.screenshot({ path: resolve(out, 'support-chat-bubble-mobile-closed.png') });
    await preview.getByRole('button', { name: 'Support', exact: true }).click();
    await preview.getByRole('dialog', { name: 'JobLinks support' }).waitFor();
    await preview.screenshot({ path: resolve(out, 'support-chat-bubble-mobile.png') });
    await preview.close();
  } finally { await browser.close(); writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
