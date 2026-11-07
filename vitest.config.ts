// Vitest config: limits test discovery to the project's own tests/ folder so that
// test files shipped under .claude/ (reference skill assets) are not picked up.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
