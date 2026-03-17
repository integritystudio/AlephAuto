import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_API_PORT = '8080';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const apiPort = env.JOBS_API_PORT || DEFAULT_API_PORT;
  const apiBase = `http://localhost:${apiPort}`;
  const wsBase = `ws://localhost:${apiPort}`;

  return {
    plugins: [
      react(),
      sentryVitePlugin({
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        authToken: env.SENTRY_AUTH_TOKEN,
        disable: !env.SENTRY_AUTH_TOKEN,
      }),
    ],
    build: {
      sourcemap: 'hidden',
    },
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
