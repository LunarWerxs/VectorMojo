// Build-time only: renders the first view to HTML so tools/prerender.ts can put
// it in dist/index.html, and the browser paints the page before any JS runs.
// Nothing here ships to the browser; src/main.ts hydrates the result.
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import App from './App.vue'

export function render(): Promise<string> {
  return renderToString(createSSRApp(App))
}
