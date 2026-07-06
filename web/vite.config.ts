import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.resolve(__dirname, '..');

export default defineConfig(({ mode }) => {
  // Load the repo-root .env in addition to process.env (shell vars win,
  // so production builds that pass env via the shell keep working).
  const env = loadEnv(mode, rootDir, '');
  const discordClientId = env.VITE_DISCORD_CLIENT_ID || env.DISCORD_CLIENT_ID || '';

  return {
    plugins: [react()],
    envDir: rootDir,
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            discord: ['@discord/embedded-app-sdk'],
            icons: ['lucide-react'],
          },
        },
      },
    },
    define: {
      global: 'globalThis',
      __BUILD_VERSION__: JSON.stringify(process.env.NODE_ENV === 'production' ? `build-${Date.now()}` : 'dev-stable'),
      'import.meta.env.VITE_DISCORD_CLIENT_ID': JSON.stringify(discordClientId),
    },
  };
});
