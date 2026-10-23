import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths: works at a domain root or in a subfolder (e.g. GitHub Pages)
  build: {
    target: 'es2022', // top-level await in main.js
  },
});
