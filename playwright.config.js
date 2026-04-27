/**
 * GrapeStrap — Playwright config
 *
 * Drives the Electron build via @playwright/test. The smoke spec launches the
 * compiled main entry (`dist/main/main.js`) under Xvfb-equivalent virtual
 * display when run on CI; locally it runs against the real display.
 *
 * `--no-sandbox` is passed only because development sandboxes/CI commonly run
 * as root. Packaged builds enforce the secure default.
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    trace: 'retain-on-failure'
  }
})
