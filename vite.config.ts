import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Relative base so the static build works on any host / subpath
// (Cloudflare Pages root, GitHub Pages project subpath, or a plain folder).
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  // MuPDF's ESM wrapper initializes its WASM runtime with top-level await.
  build: { target: 'esnext' },
  optimizeDeps: {
    // Pre-bundling rewrites mupdf-wasm.js's import.meta.url and makes the
    // sibling .wasm request point at Vite's HTML fallback.
    exclude: ['mupdf'],
    esbuildOptions: { target: 'esnext' },
  },
})
