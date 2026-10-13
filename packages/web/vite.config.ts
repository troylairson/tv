import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const server = process.env.RETRO_TV_SERVER ?? 'http://localhost:8420';

export default defineConfig({
  plugins: [preact()],
  // Chromecast with Google TV runs a recent Chromium WebView, but keep output conservative.
  build: { target: 'es2019' },
  server: {
    host: true,
    proxy: { '/api': server, '/plex': server },
  },
});
