import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const getDiscordClientId = () => {
  const viteEnv = process.env.VITE_DISCORD_CLIENT_ID;
  const directEnv = process.env.DISCORD_CLIENT_ID;
  const wranglerVar = process.env.DISCORD_CLIENT_ID;
  
  const clientId = viteEnv || directEnv || wranglerVar;
  
  if (!clientId && process.env.NODE_ENV === 'production') {
    throw new Error('Discord Client ID is required for production build');
  }
  
  return clientId;
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