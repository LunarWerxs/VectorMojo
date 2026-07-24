import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

const samplesDirectory = fileURLToPath(new URL('../public/samples/', import.meta.url))

// Vite copies every file under public/ into the deployable build, including files
// ignored by Git. Pin both the name and content of the intentionally public sample.
const approvedSamples = new Map([
  [
    'vector-mojo-sample.psd',
    'a63830a1a90f9688566e2c84c48258aa638d65ee6d7d8ddac4fed3f4f481b0ac',
  ],
])

function publicFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) return publicFiles(absolutePath)
    return [relative(samplesDirectory, absolutePath).split(sep).join('/')]
  })
}

const actualSamples = publicFiles(samplesDirectory).sort()
const unexpected = actualSamples.filter((file) => !approvedSamples.has(file))
const missing = [...approvedSamples.keys()].filter((file) => !actualSamples.includes(file))
const changed = [...approvedSamples].flatMap(([file, expectedHash]) => {
  if (missing.includes(file)) return []
  const actualHash = createHash('sha256')
    .update(readFileSync(join(samplesDirectory, file)))
    .digest('hex')
  return actualHash === expectedHash ? [] : [file]
})

if (unexpected.length || missing.length || changed.length) {
  const details = [
    unexpected.length ? `unexpected: ${unexpected.join(', ')}` : '',
    missing.length ? `missing: ${missing.join(', ')}` : '',
    changed.length ? `content changed: ${changed.join(', ')}` : '',
  ].filter(Boolean)

  console.error('Refusing to build: public/samples failed its release allowlist.')
  console.error(details.join('; '))
  console.error('Move private files to local-samples/. Update this check only for reviewed public assets.')
  process.exit(1)
}

console.log(`Public sample audit passed (${actualSamples.length} approved file).`)
