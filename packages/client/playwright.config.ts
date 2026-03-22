import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration for the Heist client.
 *
 * Both the Bun WebSocket server (port 3001) and the Vite dev server
 * (port 5173) must be running before tests execute. The webServer block
 * below starts the Vite dev server automatically; the WS server is expected
 * to already be running (see README / CI setup) or you can extend the
 * webServer array to start it too.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  // Run every test file in parallel but keep tests within a file sequential
  // so we don't share state between scenarios.
  fullyParallel: true,

  // Retry once in CI to absorb transient network noise; never locally.
  retries: process.env.CI ? 1 : 0,

  // Limit workers in CI to avoid exhausting the machine's ports.
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-report/results.xml' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:5173',

    // Capture traces on the first retry so failures are fully debuggable.
    trace: 'on-first-retry',

    // Always capture screenshots on failure.
    screenshot: 'only-on-failure',

    // Record video on the first retry alongside the trace.
    video: 'on-first-retry',

    // Extra time for the WebSocket handshake to complete after navigation.
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  // Start the Vite dev server before running tests and tear it down after.
  // The WS server (packages/server) is assumed to be running on port 3001.
  // To also start the WS server add a second entry pointing at
  // `bun run --cwd ../server src/index.ts` with port 3001.
  webServer: [
    {
      command: 'bun run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      // stdout/stderr from vite are verbose; suppress in non-CI runs.
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'bun run --cwd ../../packages/server src/index.ts',
      url: 'http://localhost:3001',
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],

  outputDir: 'playwright-output',
})
