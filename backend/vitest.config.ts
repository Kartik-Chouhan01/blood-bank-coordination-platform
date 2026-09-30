import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['tests/helpers/globalSetup.ts'],
    // Integration tests share one replica set; run files sequentially to keep them isolated.
    fileParallelism: false,
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Process entry point and CLI are exercised by the build/deploy checks, not unit tests.
      exclude: ['src/server.ts', 'src/cli/**'],
      reporter: ['text-summary', 'html', 'lcov'],
      // Ratchet: a little below the measured values; raise as coverage grows, never lower.
      thresholds: { statements: 88, branches: 76, functions: 92, lines: 92 },
    },
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // Replaced per test file with the in-memory replica set URI (see helpers/testDb.ts).
      MONGODB_URI: 'mongodb://127.0.0.1:1/unused',
      CORS_ORIGINS: 'http://localhost:5173',
      JWT_ACCESS_SECRET: 'test-only-access-secret-at-least-32-characters',
      BCRYPT_ROUNDS: '4',
      AUTH_RATE_LIMIT_MAX: '10000',
      JOBS_ENABLED: 'false',
    },
  },
});
