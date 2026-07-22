import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Relative base so the static build works on any host / subpath
// (Cloudflare Pages root, GitHub Pages project subpath, or a plain folder).
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
})
