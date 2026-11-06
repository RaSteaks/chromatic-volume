import { webkit } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const origin = process.env.COVER_BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await webkit.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  await page.goto(new URL('/preview?motion=off', origin).href);
  await page.locator('.preview-page[data-ready="true"]').waitFor();
  const path = fileURLToPath(new URL('../public/cover.png', import.meta.url));
  await page.screenshot({ path });
  console.log(`Generated 1600 × 1000 cover: ${path}`);
} finally {
  await browser.close();
}
