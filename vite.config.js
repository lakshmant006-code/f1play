import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Pages: the game, the collectible cards, the character creator and Learn.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        card: resolve(import.meta.dirname, 'card/index.html'),
        creator: resolve(import.meta.dirname, 'creator/index.html'),
        learn: resolve(import.meta.dirname, 'learn/index.html'),
      },
    },
  },
});
