import { describe, expect, test } from 'bun:test'
import {
  pngDimensionsFromSvg,
  svgSize,
  svgWithBackground,
} from '../src/lib/outputs'

describe('SVG export helpers', () => {
  test('inserts an opaque background before the artwork', () => {
    const result = svgWithBackground(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>',
    )
    expect(result).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff"/><path',
    )
  })
})

describe('PNG dimensions', () => {
  test('uses explicit SVG dimensions', () => {
    const svg = '<svg width="320" height="180" viewBox="0 0 320 180"></svg>'
    expect(svgSize(svg)).toEqual({ width: 320, height: 180 })
    expect(pngDimensionsFromSvg(svg)).toEqual({ width: 640, height: 360 })
  })

  test('falls back to the viewBox and rounds output pixels', () => {
    const svg = '<svg viewBox="0 0 12.5 7.25"></svg>'
    expect(pngDimensionsFromSvg(svg)).toEqual({ width: 25, height: 15 })
  })
})
