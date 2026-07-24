import { describe, expect, test } from 'bun:test'
import { Resvg } from '@resvg/resvg-js'
import { writePsd, type Psd } from 'ag-psd'
import { PNG } from 'pngjs'
import { psdToSvg } from '../src/lib/psd-to-svg'

function renderSvg(svg: string) {
  const image = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng()
  return PNG.sync.read(Buffer.from(image))
}

function expectPixelMatch(
  actual: Uint8Array,
  expected: Uint8Array,
  thresholds = { mean: 0.25, bigPixels: 0 },
) {
  expect(actual.length).toBe(expected.length)
  let totalDifference = 0
  let bigPixels = 0
  for (let offset = 0; offset < actual.length; offset += 4) {
    let pixelDifference = 0
    for (let channel = 0; channel < 4; channel++) {
      const difference = Math.abs(actual[offset + channel] - expected[offset + channel])
      totalDifference += difference
      pixelDifference = Math.max(pixelDifference, difference)
    }
    if (pixelDifference > 16) bigPixels++
  }

  expect(totalDifference / actual.length).toBeLessThanOrEqual(thresholds.mean)
  expect(bigPixels).toBeLessThanOrEqual(thresholds.bigPixels)
}

describe('PSD pixel regression gate', () => {
  test('renders a positioned solid vector shape into the expected pixels', async () => {
    const width = 32
    const height = 24
    const rect = {
      open: false,
      operation: 'combine' as const,
      fillRule: 'non-zero' as const,
      knots: [
        [4, 3],
        [28, 3],
        [28, 20],
        [4, 20],
      ].map(([x, y]) => ({ linked: true, points: [x, y, x, y, x, y] })),
    }
    const psd: Psd = {
      width,
      height,
      children: [
        {
          name: 'Regression rectangle',
          left: 4,
          top: 3,
          right: 28,
          bottom: 20,
          imageData: { width: 24, height: 17, data: new Uint8Array(24 * 17 * 4) },
          vectorFill: { type: 'color', color: { r: 36, g: 87, b: 230 } },
          vectorMask: { fillStartsWithAllPixels: false, paths: [rect] },
        },
      ],
    }

    const result = await psdToSvg(writePsd(psd, { noBackground: true }))
    const rendered = renderSvg(result.svg)
    expect({ width: rendered.width, height: rendered.height }).toEqual({ width, height })

    const expected = new Uint8Array(width * height * 4)
    for (let y = 3; y < 20; y++) {
      for (let x = 4; x < 28; x++) {
        const offset = (y * width + x) * 4
        expected.set([36, 87, 230, 255], offset)
      }
    }
    expectPixelMatch(rendered.data, expected)
  })

  test('round-trips stored raster pixels without visual drift', async () => {
    const width = 4
    const height = 3
    const pixels = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        pixels.set((x + y) % 2 ? [245, 158, 11, 255] : [15, 23, 42, 255], offset)
      }
    }
    const psd: Psd = {
      width,
      height,
      children: [
        {
          name: 'Regression pixels',
          imageData: { width, height, data: pixels },
        },
      ],
    }

    const result = await psdToSvg(writePsd(psd, { noBackground: true }))
    const rendered = renderSvg(result.svg)
    expect({ width: rendered.width, height: rendered.height }).toEqual({ width, height })
    expectPixelMatch(rendered.data, pixels)
  })
})
