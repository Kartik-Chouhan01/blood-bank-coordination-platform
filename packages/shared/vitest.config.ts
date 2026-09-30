import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary', 'html', 'lcov'],
      // Ratchet: a little below the measured values; raise as coverage grows, never lower.
      thresholds: { statements: 88, branches: 90, functions: 80, lines: 88 },
    },
  },
});
