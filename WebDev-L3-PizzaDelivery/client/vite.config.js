import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server binds to 0.0.0.0 so it is reachable from outside a container.
// Requests to `/api` are proxied to the Express server, which lets the client
// use relative URLs in development and avoids CORS during local work.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
