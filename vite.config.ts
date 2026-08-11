import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// The published app version, read from this package.json. Baked in at build
// time as an anonymous build stamp for the visit ping (see
// src/lib/analytics.ts) - never anything that identifies a person.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')) as {
  version: string
}

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
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
