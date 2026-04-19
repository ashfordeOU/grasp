import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// E2E test — requires the extension to be built first (npm run build)
// Skipped in CI unless BROWSER_EXT_E2E=1 is set
const runE2E = process.env.BROWSER_EXT_E2E === '1';

(runE2E ? test : test.skip)('extension loads on GitHub repo page', async () => {
  const distPath = path.join(__dirname, '../../dist');
  if (!fs.existsSync(distPath)) {
    throw new Error('Extension not built — run npm run build first');
  }

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${distPath}`,
      `--load-extension=${distPath}`,
    ],
  });

  const page = await context.newPage();
  await page.goto('https://github.com/ashfordeOU/grasp');
  await expect(
    page.locator('[data-grasp="sidebar-toggle"]')
  ).toBeVisible({ timeout: 5000 });

  await context.close();
});

test('manifest.json is valid for extension loading', () => {
  const manifestPath = path.join(__dirname, '../../manifest.json');
  expect(fs.existsSync(manifestPath)).toBe(true);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  expect(manifest.manifest_version).toBe(3);
});
