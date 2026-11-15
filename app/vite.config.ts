import { defineConfig } from 'vite';

// VITE_BASE is the URL subpath when the build is hosted (scripts/deploy-pages.sh sets it for GitHub Pages).
// The dev and preview servers listen on loopback only.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
