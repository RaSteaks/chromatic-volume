import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/reference/*.spec.ts'] },
});
