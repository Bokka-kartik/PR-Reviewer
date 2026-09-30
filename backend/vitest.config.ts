import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Process start-up and the real Anthropic/GitHub/Mongo wiring are exercised in CI or by hand.
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'text'],
      // Floors, a little under today's numbers: they catch regressions, not noise.
      // The MongoDB store is only covered when MONGO_TEST_URI is set (CI), so this
      // is the lower bound for a local run.
      thresholds: { statements: 88, branches: 80, functions: 82, lines: 88 },
    },
  },
})
