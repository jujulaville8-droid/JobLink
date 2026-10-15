// Run against a local Next build using synthetic, read-only Supabase data.
// TEST_BASE_URL, EVIDENCE_DIR and optional CHROMIUM_PATH configure this check.
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

(async () => {
  const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4349';
  const out = resolve(process.env.EVIDENCE_DIR || '/tmp/joblink-home-stats');
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const results = [];
  try {
    for (const width of [320, 375, 390, 430, 1440]) {
      for (const scheme of ['light', 'dark']) {
        for (const mode of ['normal', 'enlarged-text', 'reduced-motion']) {
          const page = await browser.newPage({
            viewport: { width, height: width === 1440 ? 1000 : 844 },
            colorScheme: scheme,
            reducedMotion: mode === 'reduced-motion' ? 'reduce' : 'no-preference',
          });
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.goto(base, { waitUntil: 'domcontentloaded' });
          await page.evaluate(() => document.fonts.ready);
          const section = page.locator('.home-trust');
          await section.scrollIntoViewIfNeeded();
          await page.waitForFunction(() => [...document.querySelectorAll('.home-stat>span')].every(el =>
            el.textContent === Number(el.dataset.reducedValue).toLocaleString('en-US')));
          if (mode === 'enlarged-text') {
            // Text-only enlargement preserves the viewport and doubles actual
            // counter/caption fonts, unlike a device-pixel-ratio change.
            await section.evaluate(el => {
              const nodes = [...el.querySelectorAll('p, .home-stat>span')];
              const fonts = nodes.map(node => parseFloat(getComputedStyle(node).fontSize));
              nodes.forEach((node, i) => { node.style.fontSize = `${fonts[i] * 2}px`; });
            });
          }
          const result = await section.evaluate(el => {
            const bounds = node => {
              const r = node.getBoundingClientRect();
              return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
            };
            const contains = (outer, inner) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 &&
              inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
            const luminance = color => {
              const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255);
              const linear = rgb.map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
              return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
            };
            const background = getComputedStyle(el).backgroundColor;
            const statNodes = [...el.querySelectorAll('.home-stat')];
            const singleRow = statNodes.every(stat => Math.abs(stat.getBoundingClientRect().top - statNodes[0].getBoundingClientRect().top) < 1);
            const counters = statNodes.map(stat => {
              const number = stat.querySelector('span');
              const label = stat.querySelector('p');
              const range = document.createRange();
              range.selectNodeContents(label);
              const color = getComputedStyle(number).color;
              const a = luminance(color), b = luminance(background);
              const contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
              const pseudo = getComputedStyle(number, '::after');
              const reduced = parseFloat(getComputedStyle(number).fontSize) === 0;
              return {
                label: label.textContent,
                count: reduced ? pseudo.content.replace(/^"|"$/g, '') : number.textContent,
                expected: number.dataset.reducedValue,
                color, contrast,
                numberFits: contains(bounds(stat), bounds(number)),
                labelFits: [...range.getClientRects()].every(r => contains(bounds(stat), r)),
                numberVisible: (reduced ? parseFloat(pseudo.fontSize) : parseFloat(getComputedStyle(number).fontSize)) > 0,
              };
            });
            return {
              background, counters, singleRow,
              pageOverflow: document.documentElement.scrollWidth > innerWidth,
              sectionFits: bounds(el).left >= 0 && bounds(el).right <= innerWidth,
              membersHref: el.querySelector('.home-stat.home-members-link').getAttribute('href'),
            };
          });
          await page.locator('.home-stat.home-members-link').focus();
          result.membersFocusable = await page.locator('.home-stat.home-members-link').evaluate(el => document.activeElement === el && getComputedStyle(el).outlineStyle !== 'none');
          result.errors = errors;
          result.pass = !result.pageOverflow && result.sectionFits && result.membersHref === '/members' && result.membersFocusable &&
            (mode === 'enlarged-text' || result.singleRow) &&
            errors.length === 0 && result.counters.length === 3 &&
            ['Jobs posted', 'Employers hiring', 'Members'].every((label, i) => result.counters[i].label === label) &&
            result.counters.every(c => c.numberFits && c.labelFits && c.numberVisible && c.contrast >= 4.5 &&
              c.count === Number(c.expected).toLocaleString('en-US'));
          results.push({ width, scheme, mode, ...result });
          writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
          console.log(`${result.pass ? 'PASS' : 'FAIL'} ${width} ${scheme} ${mode}`);
          if (mode === 'normal' || (width === 320 && mode === 'enlarged-text')) {
            await page.locator('.home-stat.home-members-link').evaluate(el => el.blur());
            await page.screenshot({ path: resolve(out, `${scheme}-${width}-${mode}.png`) });
          }
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
  for (const r of results.filter(r => !r.pass)) console.log(`FAIL ${r.width} ${r.scheme} ${r.mode}: ` +
    JSON.stringify({ counters: r.counters, pageOverflow: r.pageOverflow, errors: r.errors }));
  console.log(`${results.filter(r => r.pass).length}/${results.length} responsive cases passed`);
  if (results.some(r => !r.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
