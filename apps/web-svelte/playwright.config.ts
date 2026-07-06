import { defineConfig, devices } from '@playwright/test';

const isCI = !!(
  globalThis as typeof globalThis & {
    process?: { env?: { CI?: string } };
  }
).process?.env?.CI;
const port = isCI ? 4173 : 5173;

// Fake anon key - real value not needed since all calls are mocked.
const FAKE_ANON_KEY = 'test-anon-key';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Mocked suite, no shared state — parallel workers cut CI wall time ~4x.
  workers: isCI ? 4 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: isCI ? 'pnpm preview' : 'pnpm dev',
    url: `http://localhost:${port}`,
    reuseExistingServer: !isCI,
    env: {
      PUBLIC_SUPABASE_URL: 'https://emqzcygfwcvbmhxhfkcc.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
      PUBLIC_VAPID_KEY:
        'BHKoiccZwq3Y5Qw5dmFxVLJIA7w9zcSZkchPKWk-vxBeR421yieZW7gGxuluBBa6sRmpIsFXRSuFyRarLcdvqT4',
    },
  },
});
