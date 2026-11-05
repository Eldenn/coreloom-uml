import { defineConfig } from 'vitest/config'

// Unit tests for the app's own logic (src/**/*.test.ts), in Node. Screens are tested the
// coreloom-ui way, in a real browser with Playwright + axe, not with jsdom.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // No web unit test yet — don't fail the pipeline until the first one lands.
    passWithNoTests: true,
  },
})
