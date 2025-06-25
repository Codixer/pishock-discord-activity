import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Check for Discord Client ID from multiple sources
const getDiscordClientId = () => {
  // 1. From environment variable (local .env or shell)
  const viteEnv = process.env.VITE_DISCORD_CLIENT_ID;
  
  // 2. From DISCORD_CLIENT_ID (for deploy commands)
  const directEnv = process.env.DISCORD_CLIENT_ID;
  
  // 3. From wrangler vars (if set in wrangler.jsonc)
  const wranglerVar = process.env.DISCORD_CLIENT_ID;
  
  const clientId = viteEnv || directEnv || wranglerVar;
  
  console.log('🔍 Discord Client ID Detection:');
  console.log('  VITE_DISCORD_CLIENT_ID:', viteEnv ? '✅ Set' : '❌ Not set');
  console.log('  DISCORD_CLIENT_ID:', directEnv ? '✅ Set' : '❌ Not set');
  console.log('  Final Client ID:', clientId ? '✅ Found' : '❌ Missing');
  
  if (!clientId && process.env.NODE_ENV === 'production') {
    console.error('❌ CRITICAL: No Discord Client ID found for production build!');
    console.error('💡 Solutions:');
    console.error('   1. Set DISCORD_CLIENT_ID env var: export DISCORD_CLIENT_ID="your_id"');
    console.error('   2. Create .env file: echo "VITE_DISCORD_CLIENT_ID=your_id" > .env');
    console.error('   3. Use deploy command: npm run deploy:with-env');
  }
  
  return clientId;
};

// Check for Controller+ SKU ID
const getControllerPlusSkuId = () => {
  const viteEnv = process.env.VITE_CONTROLLER_PLUS_SKU_ID;
  const directEnv = process.env.CONTROLLER_PLUS_SKU_ID;
  
  const skuId = viteEnv || directEnv;
  
  console.log('🎯 Controller+ SKU ID Detection:');
  console.log('  VITE_CONTROLLER_PLUS_SKU_ID:', viteEnv ? '✅ Set' : '❌ Not set');
  console.log('  CONTROLLER_PLUS_SKU_ID:', directEnv ? '✅ Set' : '❌ Not set');
  console.log('  Final SKU ID:', skuId ? '✅ Found' : '❌ Missing (optional)');
  
  return skuId;
};

const discordClientId = getDiscordClientId();
const controllerPlusSkuId = getControllerPlusSkuId();

// Generate a proper version identifier
const generateBuildVersion = () => {
  if (process.env.NODE_ENV === 'production') {
    // Use deployment timestamp for production
    return `build-${Date.now()}`;
  } else {
    // Use stable dev version for development
    return 'dev-stable';
  }
};

const buildVersion = generateBuildVersion();
console.log('Build version:', buildVersion);

// https://vitejs.dev/config/
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
    // Inject Discord Client ID at build time from any available source
    'import.meta.env.VITE_DISCORD_CLIENT_ID': JSON.stringify(discordClientId || ''),
    // Inject Controller+ SKU ID at build time
    'import.meta.env.VITE_CONTROLLER_PLUS_SKU_ID': JSON.stringify(controllerPlusSkuId || ''),
  },
});