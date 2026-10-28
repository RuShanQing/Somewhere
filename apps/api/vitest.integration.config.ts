import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    setupFiles: ['test/integration/setup-env.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
  },
});
