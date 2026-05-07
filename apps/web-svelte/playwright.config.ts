import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const port = isCI ? 4173 : 5173;

// Fake but JWT-shaped anon key — real value not needed since all calls are mocked
const FAKE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? 'github' : 'html',
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
