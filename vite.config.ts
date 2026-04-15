import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const getDiscordClientId = () => {
  const viteEnv = process.env.VITE_DISCORD_CLIENT_ID;
  const directEnv = process.env.DISCORD_CLIENT_ID;
  const wranglerVar = process.env.DISCORD_CLIENT_ID;

  const clientId = viteEnv || directEnv || wranglerVar;

  // Allow build to proceed without client ID for CI/testing purposes
  // The application will handle missing client ID at runtime
  if (!clientId && process.env.NODE_ENV === 'production') {
    console.warn('Warning: Discord Client ID not set. Application may not function correctly.');
  }

  return clientId || '';
};

const discordClientId = getDiscordClientId();

const generateBuildVersion = () => {
  if (process.env.NODE_ENV === 'production') {
    return `build-${Date.now()}`;
  } else {
    return 'dev-stable';
  }
};

const buildVersion = generateBuildVersion();

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: {
      port: 3001,
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
    __BUILD_VERSION__: JSON.stringify(buildVersion),
    'import.meta.env.VITE_DISCORD_CLIENT_ID': JSON.stringify(discordClientId || ''),
  },
});