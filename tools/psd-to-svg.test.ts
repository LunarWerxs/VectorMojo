import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { writePsd, type Psd } from 'ag-psd'
import { inflate } from 'pako'
import { psdToSvg } from '../src/lib/psd-to-svg'

function pngParts(dataUri: string) {
  const png = Uint8Array.from(Buffer.from(dataUri.split(',')[1], 'base64'))
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const idat: Uint8Array[] = []
  let width = 0
  let height = 0
  for (let offset = 8; offset < png.length; ) {
    const length = view.getUint32(offset)
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8))
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      const header = new DataView(data.buffer, data.byteOffset, data.byteLength)
      width = header.getUint32(0)
      height = header.getUint32(4)
    }
    if (type === 'IDAT') idat.push(data)
    offset += 12 + length
  }

  const compressed = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0))
  let cursor = 0
  for (const part of idat) {
    compressed.set(part, cursor)
    cursor += part.length
  }
  return { width, height, scanlines: inflate(compressed) }
}

describe('PSD to SVG', () => {
  test('embeds raster layer pixels as a positioned PNG', async () => {
    const pixels = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ])
    const psd: Psd = {
      width: 6,
      height: 5,
      children: [
        {
          name: 'Four pixels',
          left: 2,
          top: 1,
          imageData: { width: 2, height: 2, data: pixels },
        },
      ],
    }

    const result = await psdToSvg(writePsd(psd, { noBackground: true }))
    expect(result.meta).toEqual({ width: 6, height: 5, layers: 1, skipped: 0 })
    expect(result.warnings).toEqual([])

    const image = /<image ([^>]+)\/>/.exec(result.svg)
    expect(image?.[1]).toContain('x="2"')
    expect(image?.[1]).toContain('y="1"')
    expect(image?.[1]).toContain('width="2"')
    expect(image?.[1]).toContain('height="2"')
    const uri = /href="([^"]+)"/.exec(image?.[1] ?? '')?.[1]
    expect(uri).toStartWith('data:image/png;base64,')

    const png = pngParts(uri!)
    expect({ width: png.width, height: png.height }).toEqual({ width: 2, height: 2 })
    expect([...png.scanlines]).toEqual([
      0, 255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 0, 255, 255, 255, 255, 255, 255,
    ])
  })

  test('converts the bundled vector sample without warnings or skipped layers', async () => {
    const sample = join(import.meta.dir, '..', 'public', 'samples', 'vector-mojo-sample.psd')
    const result = await psdToSvg(await Bun.file(sample).arrayBuffer())
    expect(result.meta).toEqual({ width: 1200, height: 800, layers: 8, skipped: 0 })
    expect(result.warnings).toEqual([])
    expect(result.svg).not.toContain('<image ')
  })

  test('warns when a group-only blend mode appears on a leaf layer', async () => {
    const psd: Psd = {
      width: 1,
      height: 1,
      children: [
        {
          name: 'Odd blend',
          blendMode: 'pass through',
          imageData: { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) },
        },
      ],
    }
    const result = await psdToSvg(writePsd(psd, { noBackground: true }))
    expect(result.warnings).toContain(
      'blend mode "pass through" is group-only; rendered as normal',
    )
  })

  test('computes intersect path operations as real vector geometry', async () => {
    const rect = (
      left: number,
      top: number,
      right: number,
      bottom: number,
      operation: 'combine' | 'intersect',
    ) => ({
      open: false,
      operation,
      fillRule: 'non-zero' as const,
      knots: [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
      ].map(([x, y]) => ({ linked: true, points: [x, y, x, y, x, y] })),
    })
    const psd: Psd = {
      width: 20,
      height: 10,
      children: [
        {
          name: 'Intersection',
          imageData: { width: 15, height: 10, data: new Uint8Array(15 * 10 * 4) },
          vectorFill: { type: 'color', color: { r: 255, g: 0, b: 0 } },
          vectorMask: {
            paths: [rect(0, 0, 10, 10, 'combine'), rect(5, 0, 15, 10, 'intersect')],
          },
        },
      ],
    }
    const result = await psdToSvg(writePsd(psd, { noBackground: true }))
    expect(result.warnings).toEqual([])
    expect(result.svg).toContain('fill-rule="evenodd"')

    const d = /<path d="([^"]+)"/.exec(result.svg)?.[1] ?? ''
    const values = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
    const xs = values.filter((_, index) => index % 2 === 0)
    const ys = values.filter((_, index) => index % 2 === 1)
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([5, 10])
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, 10])
  })

  test('emits document pattern pixels as an SVG pattern fill', async () => {
    const square = {
      open: false,
      operation: 'combine' as const,
      fillRule: 'non-zero' as const,
      knots: [
        [0, 0],
        [8, 0],
        [8, 8],
        [0, 8],
      ].map(([x, y]) => ({ linked: true, points: [x, y, x, y, x, y] })),
    }
    const psd: Psd = {
      width: 8,
      height: 8,
      patterns: [
        {
          name: 'Checker',
          id: 'checker-pattern',
          x: 0,
          y: 0,
          bounds: { x: 0, y: 0, w: 2, h: 2 },
          data: new Uint8Array([
            255, 255, 255, 255,
            30, 30, 30, 255,
            30, 30, 30, 255,
            255, 255, 255, 255,
          ]),
        },
      ],
      children: [
        {
          name: 'Pattern square',
          imageData: { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) },
          vectorFill: {
            type: 'pattern',
            name: 'Checker',
            id: 'checker-pattern',
            phase: { x: 1, y: 2 },
          },
          vectorMask: { paths: [square] },
        },
      ],
    }
    const result = await psdToSvg(writePsd(psd, { noBackground: true }))
    expect(result.warnings).toEqual([])
    expect(result.svg).toContain(
      '<pattern id="pattern0" patternUnits="userSpaceOnUse" x="1" y="2" width="2" height="2">',
    )
    expect(result.svg).toContain('<image width="2" height="2" href="data:image/png;base64,')
    expect(result.svg).toContain('fill="url(#pattern0)"')
  })

  test('applies a bitmap layer mask as a luminance SVG mask', async () => {
    const psd: Psd = {
      width: 4,
      height: 3,
      children: [
        {
          name: 'Masked pixels',
          left: 1,
          top: 1,
          imageData: {
            width: 2,
            height: 2,
            data: new Uint8Array([
              255, 0, 0, 255,
              255, 0, 0, 255,
              255, 0, 0, 255,
              255, 0, 0, 255,
            ]),
          },
          mask: {
            left: 1,
            top: 1,
            defaultColor: 0,
            imageData: {
              width: 2,
              height: 2,
              data: new Uint8Array([
                255, 255, 255, 255,
                0, 0, 0, 255,
                128, 128, 128, 255,
                255, 255, 255, 255,
              ]),
            },
          },
        },
      ],
    }
    const result = await psdToSvg(writePsd(psd, { noBackground: true }))
    expect(result.warnings).toEqual([])
    expect(result.svg).toContain(
      '<mask id="mask0" maskUnits="userSpaceOnUse" x="0" y="0" width="4" height="3"',
    )
    expect(result.svg).toContain('<g mask="url(#mask0)">')

    const maskDef = /<mask id="mask0"[\s\S]+?<\/mask>/.exec(result.svg)?.[0] ?? ''
    const uri = /href="([^"]+)"/.exec(maskDef)?.[1]
    const png = pngParts(uri!)
    expect({ width: png.width, height: png.height }).toEqual({ width: 2, height: 2 })
    expect([...png.scanlines]).toEqual([
      0, 255, 255, 255, 255, 0, 0, 0, 255,
      0, 128, 128, 128, 255, 255, 255, 255, 255,
    ])
  })

  test('uses a vector mask to mask raster artwork instead of treating it as a shape', async () => {
    const path = {
      open: false,
      operation: 'combine' as const,
      fillRule: 'non-zero' as const,
      knots: [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
      ].map(([x, y]) => ({ linked: true, points: [x, y, x, y, x, y] })),
    }
    const psd: Psd = {
      width: 4,
      height: 4,
      children: [
        {
          name: 'Vector-masked pixels',
          imageData: {
            width: 4,
            height: 4,
            data: new Uint8Array(4 * 4 * 4).fill(255),
          },
          vectorMask: { paths: [path] },
        },
      ],
    }
    const result = await psdToSvg(writePsd(psd, { noBackground: true }))
    expect(result.warnings).toEqual([])
    expect(result.svg).toContain('<image x="0" y="0" width="4" height="4"')
    expect(result.svg).toContain('<g mask="url(#mask0)">')
    expect(result.svg).toContain('<path d="M 1,1 C 1,1 3,1 3,1')
  })
})
