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
      port: 5174,       // <--- Forces port 5174
      strictPort: true, // <--- Fails if port is busy (prevents switching to 5175)
      host: true        // Expose to network for mobile testing
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
      reportCompressedSize: false,
    }
  };
});