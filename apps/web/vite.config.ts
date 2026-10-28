import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET ?? 'http://localhost:4301';

  return {
    plugins: [vue()],
    server: {
      port: 5273,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false,
        },
      },
    },
    preview: {
      port: 4273,
      strictPort: true,
    },
    build: {
      sourcemap: true,
    },
  };
});
