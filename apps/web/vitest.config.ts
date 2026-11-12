import { defineConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

// Unit tests for the app's own logic (src/**/*.test.ts), in Node. Screens are tested the
// coreloom-ui way, in a real browser with Playwright + axe, not with jsdom.
export default defineConfig({
  // The app's `@/…` imports, so a test can reach the pure functions under src/lib (uml-edit…).
  resolve: { alias: viteConfig.resolve?.alias ?? [] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // No web unit test yet — don't fail the pipeline until the first one lands.
    passWithNoTests: true,
  },
})
