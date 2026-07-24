import { optimize } from 'svgo/dist/svgo.browser.js'
import type { ToSvgResult } from './registry'
import { svgSize } from './outputs'

function decodeSvg(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes)
  if (data[0] === 0xff && data[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(data.subarray(2))
  }
  if (data[0] === 0xfe && data[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(data.subarray(2))
  }
  return new TextDecoder().decode(data).replace(/^\uFEFF/, '')
}

export function formatSvg(source: string, precision = 2, minify = true): string {
  const floatPrecision = Math.max(0, Math.min(6, Math.round(precision)))
  return optimize(source, {
    multipass: minify,
    js2svg: { pretty: !minify, indent: 2 },
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            removeViewBox: false,
            cleanupNumericValues: { floatPrecision },
            convertPathData: { floatPrecision },
            convertTransform: { floatPrecision },
          },
        },
      },
      // Local SVG previews must not retain executable script or event handlers.
      'removeScriptElement',
    ],
  }).data
}

export async function normalizeSvg(bytes: ArrayBuffer): Promise<ToSvgResult> {
  const source = decodeSvg(bytes)
  if (!/<svg[\s>]/i.test(source)) throw new Error('No SVG root element found.')

  const svg = formatSvg(source)
  const { width, height } = svgSize(svg)
  return {
    svg,
    warnings: [],
    meta: {
      width,
      height,
      originalBytes: bytes.byteLength,
      optimizedBytes: new TextEncoder().encode(svg).byteLength,
      summary: 'optimized',
    },
  }
}
