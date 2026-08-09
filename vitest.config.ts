import { defineConfig } from 'vitest/config'

/**
 * Tests run in node, not jsdom: what's covered here is main-process and pure
 * logic (path containment, format tables, build config). Component tests would
 * need an `environment: 'jsdom'` project alongside this one.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts', 'src/**/*.test.ts', 'build-config/**/*.test.ts'],
  },
})
