import { psdToSvg } from '../src/lib/psd-to-svg'
const [psdPath, outPath] = [process.argv[2], process.argv[3]]
const r = psdToSvg(await Bun.file(psdPath).arrayBuffer())
await Bun.write(outPath, r.svg)
console.log(outPath, JSON.stringify(r.meta), r.warnings.join(' | '))
