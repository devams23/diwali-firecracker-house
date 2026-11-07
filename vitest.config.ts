// Vitest config: limits test discovery to the project's own tests/ folder so that
// test files shipped under .claude/ (reference skill assets) are not picked up, and keeps the
// Playwright specs in tests/e2e out of the unit run.
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
});
