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
export async function svgToPng(
  svg: string,
  scale = 1,
  background?: string,
): Promise<Blob> {
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
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Add a background as the first painted SVG element. */
export function svgWithBackground(svg: string, color = '#ffffff'): string {
  return svg.replace(
    /(<svg\b[^>]*>)/i,
    `$1<rect width="100%" height="100%" fill="${color}"/>`,
  )
}

/** Apply the selected precision and compact/pretty formatting for export. */
export async function formatSvgForExport(
  svg: string,
  precision = 2,
  minify = true,
): Promise<string> {
  const { formatSvg } = await import('./svg-to-svg')
  return formatSvg(svg, precision, minify)
}

/** Render an SVG string into a same-size, vector PDF. */
export async function svgToPdf(svg: string): Promise<Blob> {
  const { width, height } = svgSize(svg)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('SVG has invalid dimensions')
  }

  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') {
    throw new Error('SVG could not be parsed for PDF export')
  }

  // svg2pdf resolves computed styles through the live document. Keep the
  // artwork off-screen while it renders, then remove it immediately.
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    `position:fixed;left:-100000px;top:-100000px;width:${width}px;height:${height}px;` +
    'pointer-events:none'
  const element = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement
  element.setAttribute('width', String(width))
  element.setAttribute('height', String(height))
  host.appendChild(element)
  document.body.appendChild(host)

  try {
    // Both libraries are intentionally lazy: downloading SVG/PNG never pays
    // for the PDF renderer.
    const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [width, height],
      compress: true,
    })
    await pdf.svg(element, { x: 0, y: 0, width, height })
    return pdf.output('blob')
  } finally {
    host.remove()
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
