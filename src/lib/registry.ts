// Converter registry. SVG is the hub format: every input converts *to* SVG,
// then SVG exports to PNG/PDF/optimized-SVG. Heavy WASM engines (mupdf, gs,
// vtracer) get lazy-loaded here as they land, so the initial bundle stays small.

import type { Format } from './detect'
import { psdToSvg } from './psd-to-svg'

export interface ToSvgResult {
  svg: string
  warnings: string[]
  meta: Record<string, unknown>
}

export type ToSvgConverter = (bytes: ArrayBuffer) => Promise<ToSvgResult>

const converters: Partial<Record<Format, ToSvgConverter>> = {
  psd: async (bytes) => {
    const r = psdToSvg(bytes)
    return { svg: r.svg, warnings: r.warnings, meta: r.meta }
  },
  // v1.5: pdf, ai  -> mupdf-wasm (drawPageAsSVG)
  // v1.5: svg      -> svgo normalize/optimize
  // v2:   eps      -> ghostscript-wasm
  // v2:   png/jpg  -> vtracer-wasm (raster trace)
}

export function converterFor(format: Format): ToSvgConverter | undefined {
  return converters[format]
}
