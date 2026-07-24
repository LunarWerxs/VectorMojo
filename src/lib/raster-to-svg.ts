// Approximate PNG/JPEG vectorization through ImageTracer.js. The tracer itself
// is lazy-loaded by the registry; image decoding stays in native browser APIs.
import ImageTracer from 'imagetracerjs'
import type { ToSvgResult } from './registry'

const MAX_TRACE_PIXELS = 2_000_000

export function traceImageData(image: ImageData, scale = 1): string {
  return ImageTracer.imagedataToSVG(image, {
    ltres: 1,
    qtres: 1,
    pathomit: 8,
    rightangleenhance: true,
    colorsampling: 2,
    numberofcolors: 16,
    mincolorratio: 0.01,
    colorquantcycles: 3,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    scale,
    roundcoords: 2,
    viewbox: false,
    desc: false,
    blurradius: 0,
    blurdelta: 20,
  })
}

export async function rasterToSvg(bytes: ArrayBuffer): Promise<ToSvgResult> {
  const blob = new Blob([bytes])
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new Error('The raster image could not be decoded.')
  }

  try {
    const sourceWidth = bitmap.width
    const sourceHeight = bitmap.height
    if (!sourceWidth || !sourceHeight) throw new Error('The raster image has no pixels.')

    const reduction = Math.min(1, Math.sqrt(MAX_TRACE_PIXELS / (sourceWidth * sourceHeight)))
    const width = Math.max(1, Math.round(sourceWidth * reduction))
    const height = Math.max(1, Math.round(sourceHeight * reduction))
    const scale = sourceWidth / width

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('2D canvas unavailable for raster tracing.')
    context.drawImage(bitmap, 0, 0, width, height)

    const warnings = [
      'Raster tracing is approximate; colors and fine detail may be simplified.',
    ]
    if (reduction < 1) {
      warnings.push(
        `The ${sourceWidth}×${sourceHeight} source was traced at ${width}×${height} ` +
          'to keep browser processing responsive.',
      )
    }

    return {
      svg: traceImageData(context.getImageData(0, 0, width, height), scale),
      warnings,
      meta: {
        width: sourceWidth,
        height: sourceHeight,
        traceWidth: width,
        traceHeight: height,
        approximate: true,
        summary: `approximate ${sourceWidth}×${sourceHeight} trace`,
      },
    }
  } finally {
    bitmap.close()
  }
}
