import { defineConfig } from '@playwright/test';

// Layout/placement checks: opens every screen in real Chrome against a FAKE
// Supabase (fake URL + intercepted requests — nothing here can reach the real
// project) and fails on overflow, clipped or spilling text, covered controls,
// and console errors. Run with `npm run test:e2e`. Screenshots land in
// e2e/screens/ (git-ignored) for eyeballing.
const PORT = 5199;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.js',
  timeout: 60_000,
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    colorScheme: 'dark',
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'small-phone', use: { viewport: { width: 360, height: 700 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run dev',
    port: PORT,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      // Process env beats .env.local in Vite, so the app can never see the
      // real project's URL/key while under test.
      VITE_SUPABASE_URL: 'https://fake.supabase.test',
      VITE_SUPABASE_ANON_KEY: 'fake-anon-key',
    },
  },
});
