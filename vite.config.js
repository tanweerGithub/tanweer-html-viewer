import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/tanweer-html-viewer/' : '/',
  server: {
    port: 5173,
    open: true,
  },
});