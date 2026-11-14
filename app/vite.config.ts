import { defineConfig } from 'vite';

// Local only: the dashboard listens on loopback and is not published.
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
