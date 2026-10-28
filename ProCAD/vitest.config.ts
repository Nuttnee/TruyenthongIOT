import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    exclude: ['vendor/**', 'node_modules/**'],
    testTimeout: 60_000,
  },
});
