import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two pages: the game and the collectible card page.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        card: resolve(import.meta.dirname, 'card/index.html'),
      },
    },
  },
});
