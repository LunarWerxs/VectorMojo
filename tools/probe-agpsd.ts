// Dev-only probe: learn ag-psd's exact data model for vector stroke/fill
// gradients on a real Connections-logo PSD, so the browser converter can be
// written against real field names (not guessed ones).
import { readPsd } from 'ag-psd'

const PSD = process.argv[2] ?? 'D:/NEWProjects/shared/Connections Logo/sub_sites/chat.psd'

const buf = await Bun.file(PSD).arrayBuffer()
const psd = readPsd(buf, {
  skipLayerImageData: true,
  skipCompositeImageData: true,
  skipThumbnail: true,
})

function walk(layer: any, depth = 0, path: string[] = []): void {
  const name = layer.name ?? '<root>'
  const here = [...path, name]
  const has = (k: string) => (layer[k] !== undefined ? '✓' : ' ')
  if (depth > 0) {
    console.log(
      `${'  '.repeat(depth)}${name}  ` +
        `[stroke:${has('vectorStroke')} fill:${has('vectorFill')} mask:${has('vectorMask')}]`,
    )
  }
  const interesting = ['LaterWithIssues', 'G copy', 'Rectangle 1 copy', 'R']
  if (interesting.includes(name)) {
    console.log('\n===== FULL DUMP:', here.join(' / '), '=====')
    console.log('ALL layer keys =', Object.keys(layer).join(', '))
    console.log('vectorStroke =', JSON.stringify(layer.vectorStroke, null, 2))
    console.log('vectorFill   =', JSON.stringify(layer.vectorFill, null, 2))
    console.log(
      'vectorMask (keys) =',
      layer.vectorMask ? Object.keys(layer.vectorMask) : undefined,
    )
    if (layer.vectorMask?.paths) {
      console.log('  path count =', layer.vectorMask.paths.length)
      console.log('  path[0] keys =', Object.keys(layer.vectorMask.paths[0] ?? {}))
    }
    console.log('===== END =====\n')
  }
  for (const c of layer.children ?? []) walk(c, depth + 1, here)
}

console.log('canvas size:', psd.width, 'x', psd.height)
walk(psd)
