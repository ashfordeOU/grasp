import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './__tests__/e2e',
  timeout: 30000,
  use: {
    headless: false, // Extensions require non-headless in older Playwright
  },
});
