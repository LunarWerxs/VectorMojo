import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'

// Puts the server-rendered first view into dist/index.html, so a visitor sees
// the page as soon as the HTML arrives instead of after the JS has run. The
// server bundle comes from `vite build --ssr src/entry-server.ts` and is
// deleted afterwards; only dist/ is published.
const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const serverBundle = join(projectRoot, 'dist-ssr')
const indexPath = join(projectRoot, 'dist', 'index.html')
const mountPoint = '<div id="app"></div>'

const { render } = (await import(
  pathToFileURL(join(serverBundle, 'entry-server.js')).href
)) as { render: () => Promise<string> }
const appHtml = await render()

const page = readFileSync(indexPath, 'utf-8')
if (page.split(mountPoint).length !== 2) {
  throw new Error(`dist/index.html must contain exactly one empty ${mountPoint}.`)
}
// A replacer function, so a "$" in the rendered markup is never read as a
// replacement pattern.
writeFileSync(indexPath, page.replace(mountPoint, () => `<div id="app">${appHtml}</div>`))
rmSync(serverBundle, { recursive: true, force: true })

console.log(`Prerendered the first view into dist/index.html (${(appHtml.length / 1024).toFixed(1)} KB).`)
