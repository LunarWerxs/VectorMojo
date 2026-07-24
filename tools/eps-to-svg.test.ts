import { describe, expect, test } from 'bun:test'
import { detect } from '../src/lib/detect'

describe('EPS to SVG', () => {
  test('detects PostScript and binary EPS headers as supported', () => {
    const postscript = new TextEncoder().encode('%!PS-Adobe-3.0 EPSF-3.0\n')
    const binary = new Uint8Array([0xc5, 0xd0, 0xd3, 0xc6, 0, 0, 0, 0])

    expect(detect(postscript.buffer, 'artwork.eps')).toMatchObject({
      format: 'eps',
      supported: true,
    })
    expect(detect(binary.buffer, 'artwork.eps')).toMatchObject({
      format: 'eps',
      supported: true,
    })
  })
})
