import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  },
});