import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: ['test/unit/**/*.spec.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: ['default'],
  },
});
