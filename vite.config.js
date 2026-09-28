import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Three pages: the game, the collectible cards and the character creator.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        card: resolve(import.meta.dirname, 'card/index.html'),
        creator: resolve(import.meta.dirname, 'creator/index.html'),
      },
    },
  },
});
