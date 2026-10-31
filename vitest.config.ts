import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The unit-tested code is src/lib: pages and components are .astro
    // templates, checked by `astro check` and the build.
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary', 'json-summary'],
      // As measured on 2026-10-30, rounded down: they ratchet up, never down.
      thresholds: { lines: 91, statements: 89, branches: 90, functions: 84 },
    },
  },
});
