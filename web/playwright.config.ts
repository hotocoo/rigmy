import { defineConfig } from '@playwright/test';

/**
 * E2E against the real stack: the Rust API and the built web app. Locally,
 * reuseExistingServer picks up the running dev servers; in CI, Playwright starts
 * both — the API from a freshly seeded database with no offers, so the tests
 * assert on the seed catalogue and engine behaviour, never on live prices.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // The CARGO_HOME prefix is only needed where cargo's default home is not
      // writable (local sandboxes); CI uses the default.
      command: (process.env.CARGO_HOME ? `CARGO_HOME="$PWD/.ci/cargo" CARGO_TARGET_DIR="$PWD/.ci/target" ` : '') + 'mkdir -p e2e && cargo run -p rigmy-api --quiet -- serve --db e2e/rigmy-e2e.db --config ../config --port 8787',
      url: 'http://127.0.0.1:8787/api/health',
      cwd: '..',
      timeout: 600_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run start -- --port 3000',
      url: 'http://127.0.0.1:3000',
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
