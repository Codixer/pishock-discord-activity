import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const getDiscordClientId = (env: Record<string, string>, mode: string) => {
  const viteEnv = env.VITE_DISCORD_CLIENT_ID;
  const directEnv = env.DISCORD_CLIENT_ID;
  const wranglerVar = env.DISCORD_CLIENT_ID;
  
  const clientId = viteEnv || directEnv || wranglerVar;
  
  if (!clientId && mode === 'production') {
    throw new Error('Discord Client ID is required for production build');
  }
  
  return clientId;
};

const generateBuildVersion = (mode: string) => {
  if (mode === 'production') {
    return `build-${Date.now()}`;
  } else {
    return 'dev-stable';
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const discordClientId = getDiscordClientId(env, mode);
  const buildVersion = generateBuildVersion(mode);

  return {
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
  };
});