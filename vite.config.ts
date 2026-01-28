import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    server: {
      host: true // Expose to network for mobile testing
    },
    build: {
      target: 'esnext', // Generates smaller, faster code for modern browsers
      minify: 'esbuild', // Fast minification
      reportCompressedSize: false, // Speeds up build time
    }
  };
});