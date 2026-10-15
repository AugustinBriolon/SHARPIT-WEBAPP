#!/usr/bin/env node
/**
 * Real-screen captures against a local ephemeral Postgres + fictional demo seed.
 * Requires yarn web/api already running with DEV_BYPASS_CLERK.
 *
 * All data must be fictional — never point CAPTURE_BASE_URL at production or a
 * shared Neon branch.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, 'captures/screens');
const artifactDir = '/opt/cursor/artifacts/contrast-pass/screens';
mkdirSync(outDir, { recursive: true });
mkdirSync(artifactDir, { recursive: true });

const BASE = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:3000';

/** Plan in the carnet IA is `/saison` (legacy `/plan` redirects there). */
const SCREENS = [
  { name: 'today', path: '/', waitFor: 'text=Le verdict' },
  { name: 'nutrition', path: '/nutrition', waitFor: 'text=La lecture du coach' },
  { name: 'plan', path: '/saison', waitFor: 'text=La saison' },
];

const HIDE_DEV_CHROME = `
  nextjs-portal, [data-nextjs-toast], [data-next-badge],
  #nextjs__container_errors_overlay, [data-sentry-feedback],
  #sentry-feedback { display: none !important; }
`;

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t);
    } catch {
      /* ignore */
    }
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);

  const page = await context.newPage();

  for (const screen of SCREENS) {
    await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.evaluate((t) => {
      document.documentElement.classList.toggle('dark', t === 'dark');
    }, theme);
    await page.addStyleTag({ content: HIDE_DEV_CHROME });

    try {
      await page.locator(screen.waitFor).first().waitFor({ timeout: 30_000 });
    } catch {
      console.warn(`waitFor missed for ${screen.name} (${theme}) — capturing anyway`);
    }
    await page.waitForTimeout(1000);

    const file = `${theme}-${screen.name}.png`;
    await page.screenshot({ path: resolve(outDir, file), fullPage: true, type: 'png' });
    await page.screenshot({ path: resolve(artifactDir, file), fullPage: true, type: 'png' });
    console.log('wrote', file);
  }

  await context.close();
}

await browser.close();
