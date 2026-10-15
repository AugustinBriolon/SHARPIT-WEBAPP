#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, 'fixtures/contrast-surfaces.html');
const outDir = resolve(here, 'captures');
const artifactDir = '/opt/cursor/artifacts/contrast-pass';
mkdirSync(outDir, { recursive: true });
mkdirSync(artifactDir, { recursive: true });

const shots = [
  { name: 'full', selector: null },
  { name: 'verdict', selector: '[data-shot="verdict"]' },
  { name: 'signals', selector: '[data-shot="signals"]' },
  { name: 'sports', selector: '[data-shot="sports"]' },
  { name: 'destructive', selector: '[data-shot="destructive"]' },
  { name: 'before-after', selector: '[data-shot="before-after"]' },
];

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 880, height: 1200 },
    deviceScaleFactor: 2,
  });
  await page.goto(`file://${fixture}`);
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);

  for (const shot of shots) {
    const target = shot.selector ? page.locator(shot.selector) : page.locator('body');
    const file = `${theme}-${shot.name}.png`;
    const path = resolve(outDir, file);
    await target.screenshot({ path, type: 'png' });
    await target.screenshot({ path: resolve(artifactDir, file), type: 'png' });
    console.log('wrote', file);
  }
  await page.close();
}

await browser.close();
