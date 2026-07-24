import { describe, expect, test } from 'bun:test'
import { detect } from '../src/lib/detect'
import { traceImageData } from '../src/lib/raster-to-svg'

describe('raster tracing', () => {
  test('detects PNG and JPEG inputs as supported', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

    expect(detect(png.buffer, 'art.png')).toMatchObject({ format: 'png', supported: true })
    expect(detect(jpeg.buffer, 'photo.jpg')).toMatchObject({ format: 'jpg', supported: true })
  })

  test('traces RGBA pixels into vector paths', () => {
    const data = new Uint8ClampedArray(16 * 16 * 4)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const offset = (y * 16 + x) * 4
        const inside = x >= 3 && x <= 12 && y >= 3 && y <= 12
        data[offset] = inside ? 36 : 255
        data[offset + 1] = inside ? 87 : 255
        data[offset + 2] = inside ? 230 : 255
        data[offset + 3] = 255
      }
    }

    const svg = traceImageData({ width: 16, height: 16, data } as ImageData)
    expect(svg).toContain('<svg')
    expect(svg).toContain('width="16" height="16"')
    expect(svg).toContain('<path')
  })
})
