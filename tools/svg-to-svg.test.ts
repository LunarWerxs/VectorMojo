import { describe, expect, test } from 'bun:test'
import { detect } from '../src/lib/detect'
import { formatSvg, normalizeSvg } from '../src/lib/svg-to-svg'

const SOURCE = `<?xml version="1.0"?>
<!-- editor comment -->
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">
  <script>alert("no")</script>
  <rect id="unused-name" onload="alert('no')" x="0" y="0" width="100" height="50" fill="#ff0000"/>
</svg>`

describe('SVG normalization', () => {
  test('detects SVG input as supported', () => {
    const bytes = new TextEncoder().encode(SOURCE).buffer
    expect(detect(bytes, 'artwork.svg')).toMatchObject({ format: 'svg', supported: true })
  })

  test('optimizes markup while preserving dimensions and removing executable content', async () => {
    const bytes = new TextEncoder().encode(SOURCE).buffer
    const result = await normalizeSvg(bytes)
    expect(result.meta).toMatchObject({ width: 100, height: 50, summary: 'optimized' })
    expect(result.svg).toContain('viewBox="0 0 100 50"')
    expect(result.svg).not.toContain('<!--')
    expect(result.svg).not.toContain('<script')
    expect(result.svg).not.toContain('onload')
    expect(result.meta.optimizedBytes as number).toBeLessThan(result.meta.originalBytes as number)
  })

  test('honors export precision and pretty formatting', () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">' +
      '<path d="M 1.23456 2.34567 L 18.76543 8.65432" fill="none" stroke="red"/>' +
      '</svg>'
    const result = formatSvg(source, 2, false)
    expect(result).toContain('\n')
    expect(result).toContain('1.23')
    expect(result).not.toContain('1.23456')
  })
})
