import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd() + '/..', '');
  const apiPort = env.JOBS_API_PORT ?? '3002';
  const apiBase = `http://localhost:${apiPort}`;
  const wsBase = `ws://localhost:${apiPort}`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': apiBase,
        '/ws': {
          target: wsBase,
          ws: true,
        },
      },
    },
  };
});
