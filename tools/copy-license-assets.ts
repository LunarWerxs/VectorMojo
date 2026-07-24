import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const licenseDirectory = join(projectRoot, 'dist', 'licenses')

const licenseAssets = [
  ['LICENSE', 'VectorMojo-MIT.txt'],
  ['node_modules/mupdf/LICENSE', 'MuPDF-AGPL-3.0-or-later.txt'],
  [
    'node_modules/@jspawn/ghostscript-wasm/LICENSE',
    'Ghostscript-WASM-AGPL-3.0.txt',
  ],
] as const

mkdirSync(licenseDirectory, { recursive: true })

for (const [source, target] of licenseAssets) {
  copyFileSync(join(projectRoot, source), join(licenseDirectory, target))
}

console.log(`Copied ${licenseAssets.length} license texts into dist/licenses/.`)
