// Ad-hoc check that the design-token utilities (rounded-card, bg-surface, text-md, ...)
// actually compile against the installed Tailwind. Run: node scripts/tw-utility-check.mjs
import { compile } from 'tailwindcss';
import fs from 'node:fs';

const css = fs.readFileSync('src/app/globals.css', 'utf8');
const compiled = await compile(css, {
  base: process.cwd(),
  loadStylesheet: async (id, base) => {
    if (id === 'tailwindcss') {
      return { base, content: fs.readFileSync('node_modules/tailwindcss/index.css', 'utf8'), path: 'tailwindcss' };
    }
    throw new Error('unknown stylesheet ' + id);
  },
});

const candidates = [
  'rounded-card', 'rounded-button', 'rounded-input',
  'bg-surface', 'bg-bg', 'bg-surface/50', 'bg-bg/95',
  'text-xs', 'text-sm', 'text-base', 'text-md', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl',
];
const out = compiled.build(candidates);
console.log(out.split('\n').filter((line) => /^\.|border-radius|background-color|font-size|line-height/.test(line.trim())).join('\n'));
