// SVG post-processing and exports. Everything runs in the browser.

/**
 * Light, dependency-free SVG tidy: collapse runs of whitespace between tags
 * and trim. The converter already emits clean SVG, so this is cosmetic; a full
 * svgo pass can slot in later (svgo bundles for the browser but pulls Node
 * shims, so it is deferred to keep v1's bundle lean).
 */
export function optimizeSvg(svg: string): string {
  return svg
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Chromium caps canvases around ~268 megapixels; beyond it drawImage silently
// no-ops and toBlob "succeeds" with a blank PNG. Refuse loudly instead.
const MAX_CANVAS_AREA = 240_000_000

/** Rasterize an SVG string to a PNG Blob at a given pixel scale. */
export async function svgToPng(svg: string, scale = 1): Promise<Blob> {
  const { width, height } = svgSize(svg)
  const area = Math.round(width * scale) * Math.round(height * scale)
  if (area > MAX_CANVAS_AREA) {
    const maxScale = Math.floor(Math.sqrt(MAX_CANVAS_AREA / (width * height)) * 10) / 10
    throw new Error(
      `PNG at ${scale}× would be ${Math.round(width * scale)}×${Math.round(height * scale)} ` +
        `(over the browser canvas limit). Try ${Math.max(1, maxScale)}× or lower.`,
    )
  }
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG failed to load for rasterization'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas unavailable')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Read width/height (falls back to viewBox) from an SVG string. */
export function svgSize(svg: string): { width: number; height: number } {
  const w = /\bwidth="([\d.]+)"/.exec(svg)
  const h = /\bheight="([\d.]+)"/.exec(svg)
  if (w && h) return { width: parseFloat(w[1]), height: parseFloat(h[1]) }
  const vb = /viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg)
  if (vb) return { width: parseFloat(vb[1]), height: parseFloat(vb[2]) }
  return { width: 1000, height: 1000 }
}

/** Trigger a browser download of a Blob or string. */
export function download(data: Blob | string, filename: string, mime = 'image/svg+xml') {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
