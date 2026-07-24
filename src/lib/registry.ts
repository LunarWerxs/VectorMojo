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

export interface ToSvgOptions {
  /** Zero-based page number for paged document formats. */
  page?: number
}

export type ToSvgConverter = (
  bytes: ArrayBuffer,
  options?: ToSvgOptions,
) => Promise<ToSvgResult>

const converters: Partial<Record<Format, ToSvgConverter>> = {
  psd: async (bytes) => {
    const r = await psdToSvg(bytes)
    return {
      svg: r.svg,
      warnings: r.warnings,
      meta: { ...r.meta, summary: `${r.meta.layers} shapes` },
    }
  },
  pdf: async (bytes, options) => {
    const { pdfToSvg } = await import('./pdf-to-svg')
    return pdfToSvg(bytes, options?.page)
  },
  ai: async (bytes, options) => {
    const { pdfToSvg } = await import('./pdf-to-svg')
    return pdfToSvg(bytes, options?.page)
  },
  svg: async (bytes) => {
    const { normalizeSvg } = await import('./svg-to-svg')
    return normalizeSvg(bytes)
  },
  eps: async (bytes) => {
    const { epsToSvg } = await import('./eps-to-svg')
    return epsToSvg(bytes)
  },
  png: async (bytes) => {
    const { rasterToSvg } = await import('./raster-to-svg')
    return rasterToSvg(bytes)
  },
  jpg: async (bytes) => {
    const { rasterToSvg } = await import('./raster-to-svg')
    return rasterToSvg(bytes)
  },
}

export function converterFor(format: Format): ToSvgConverter | undefined {
  return converters[format]
}
