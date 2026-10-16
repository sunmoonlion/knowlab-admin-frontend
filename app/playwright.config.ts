import { defineConfig, devices } from '@playwright/test'

const gatewayPort = Number(process.env.PORT ?? 3009)
const nextPort = Number(process.env.NEXT_PORT ?? 3008)
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseURL ?? `http://127.0.0.1:${gatewayPort}`
const pairBackendPort = Number(process.env.PAIR_FIXTURE_PORT ?? 18080)
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  webServer: externalBaseURL
    ? undefined
    : [
        {
          command: `uv run --project ../../knowlab-backend/app --frozen python -m uvicorn --app-dir ../../knowlab-backend/app scripts.pair_fixture:app --host 127.0.0.1 --port ${pairBackendPort}`,
          url: `http://127.0.0.1:${pairBackendPort}/api/health`,
          reuseExistingServer,
          timeout: 30_000,
          env: {
            PAIR_FIXTURE_PORT: String(pairBackendPort),
            PAIR_ORIGIN: baseURL,
          },
        },
        {
          command: 'pnpm prepare:standalone && node .next/standalone/server.js',
          url: `http://127.0.0.1:${nextPort}`,
          reuseExistingServer,
          timeout: 60_000,
          env: {
            DEPLOYMENT_ENV: 'test',
            AUTH_APP: 'knowlab',
            APP_ORIGIN: baseURL,
            BACKEND_INTERNAL_URL: `http://127.0.0.1:${pairBackendPort}`,
            DEPLOYMENT_ID: 'arch-v2-r2-admin-e2e',
            HOSTNAME: '127.0.0.1',
            PORT: String(nextPort),
          },
        },
        {
          command: 'node scripts/pair-gateway.mjs',
          url: `${baseURL}/__gateway_health`,
          reuseExistingServer,
          timeout: 30_000,
          env: {
            PAIR_GATEWAY_PORT: String(gatewayPort),
            NEXT_UPSTREAM_PORT: String(nextPort),
            PAIR_FIXTURE_PORT: String(pairBackendPort),
          },
        },
      ],
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
  ],
})
