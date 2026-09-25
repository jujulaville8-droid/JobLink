const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4190';
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.locator('#opportunities').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const logos = [...document.querySelectorAll('.home-job-monogram img')];
        return logos.length === 3 && logos.every(img => img.complete && img.naturalWidth > 0);
      });
      const names = await page.locator('.home-company-name').allTextContents();
      assert.equal(names.length, 3);
      assert.deepEqual(errors, []);
      await page.locator('#opportunities').screenshot({ path: `/tmp/joblink-logos-${width}.png` });
      console.log(`PASS ${width}px: all 3 logos loaded: ${names.join(', ')}`);
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/_next/image?*', route => route.request().url().includes('company-logos') ? route.fulfill({ status: 404, body: 'Image unavailable' }) : route.continue());
    await page.goto(base);
    await page.locator('#opportunities').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const boxes = [...document.querySelectorAll('.home-job-monogram')];
      return boxes.length === 3 && boxes.every(box => !box.querySelector('img') && box.textContent.trim().length > 0);
    });
    console.log('PASS simulated missing logos: all cards show initials, no broken images');
    await page.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
