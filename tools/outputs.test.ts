import { describe, expect, test } from 'bun:test'
import { svgWithBackground } from '../src/lib/outputs'

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
