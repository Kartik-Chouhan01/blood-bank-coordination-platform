import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['tests/helpers/globalSetup.ts'],
    // Integration tests share one replica set; run files sequentially to keep them isolated.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // Replaced per test file with the in-memory replica set URI (see helpers/testDb.ts).
      MONGODB_URI: 'mongodb://127.0.0.1:1/unused',
      CORS_ORIGINS: 'http://localhost:5173',
    },
  },
});
