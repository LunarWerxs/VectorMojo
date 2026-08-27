// PSD -> SVG, fully in-browser via ag-psd.
//
// Fidelity notes (the reason this file is hand-written and not a black-box):
//
// - Stroke gradients: Connections-style logos paint each letter with a *stroke*
//   gradient while the vector *fill* is disabled and left on a stale solid
//   colour. ag-psd (v31+) exposes both -- `layer.vectorStroke` (with
//   `strokeEnabled`, `fillEnabled`, `lineWidth`, caps/joins and `content` = the
//   stroke paint) and `layer.vectorFill`. Photoshop maps a shape's gradient
//   across the *layer* bounding box ("align with layer"); for a stroked shape
//   that box is stroke-inclusive, so the centred stroke only samples the middle
//   of the gradient. ag-psd gives geometry and bbox in absolute pixels, so we
//   emit gradients as `userSpaceOnUse` across `layer.{left,top,right,bottom}`
//   -- correct for fills AND strokes by construction.
//
// - Z-order: ag-psd `children` is FILE order = bottom-to-top, the same order
//   SVG paints in. Iterate forward. (Pixel-diffed against the Photoshop
//   composite; reversing flips every overlap.)
//
// - Clipping masks: a layer with `clipping: true` clips to the nearest
//   non-clipping layer below it (= before it, bottom-to-top). Emitted as an
//   SVG <clipPath> built from the base's vector path(s).
//
// - Gradient alpha: Photoshop stores colour stops and opacity stops as two
//   independent ramps; we resample both at the union of their locations.

import {
  initializeCanvas,
  readPsd,
  type Layer,
  type LayerMaskData,
  type PatternInfo,
  type PixelData,
} from 'ag-psd'

// ag-psd uses the browser's canvas only to allocate ImageData. The converter
// also runs under Bun in the dev/test tools, where a small canvas-free allocator
// keeps the same code path available.
if (typeof document === 'undefined') {
  initializeCanvas(
    () => {
      throw new Error('Canvas is unavailable in this runtime')
    },
    (width, height) =>
      ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
        colorSpace: 'srgb',
      }) as ImageData,
  )
}

export interface PsdConvertResult {
  svg: string
  warnings: string[]
  meta: { width: number; height: number; layers: number; skipped: number }
}

const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
const hex2 = (v: number) => clamp8(v).toString(16).padStart(2, '0')
const rgb = (c: { r: number; g: number; b: number }) =>
  `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`

// ---- raster layer -> embedded PNG ----

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < CRC_TABLE.length; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function pngChunk(name: string, data = new Uint8Array()): Uint8Array {
  const type = new TextEncoder().encode(name)
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(type, 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(concatBytes([type, data])))
  return out
}

function pixelByte(data: PixelData['data'], index: number): number {
  if (data instanceof Uint16Array) return data[index] >>> 8
  if (data instanceof Float32Array) return clamp8(data[index] * 255)
  return data[index]
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/** Encode ag-psd RGBA pixels as a small PNG without requiring a canvas. */
async function pngDataUri(image: PixelData): Promise<string> {
  const rowSize = image.width * 4
  const scanlines = new Uint8Array((rowSize + 1) * image.height)
  for (let y = 0; y < image.height; y++) {
    const row = y * (rowSize + 1)
    scanlines[row] = 0 // PNG filter: None
    const source = y * rowSize
    for (let x = 0; x < rowSize; x++) {
      scanlines[row + 1 + x] = pixelByte(image.data, source + x)
    }
  }

  // Keep the deflate engine out of the initial bundle; it is fetched only when
  // a PSD actually contains a raster/text layer.
  const { deflate } = await import('pako')
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, image.width)
  view.setUint32(4, image.height)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  const png = concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflate(scanlines)),
    pngChunk('IEND'),
  ])
  return `data:image/png;base64,${bytesToBase64(png)}`
}

/** Trim a number to <=3 decimals without trailing zeros. */
function num(n: number): string {
  if (!isFinite(n)) return '0'
  return (Math.round(n * 1000) / 1000).toString()
}

interface BBox {
  l: number
  t: number
  r: number
  b: number
}

/** Gradient endpoints in user space across a bbox for a Photoshop angle. */
function gradientEndpoints(bb: BBox, angleDeg: number, scale: number) {
  const W = bb.r - bb.l
  const H = bb.b - bb.t
  const cx = (bb.l + bb.r) / 2
  const cy = (bb.t + bb.b) / 2
  const a = (-angleDeg * Math.PI) / 180 // PS angle is y-up CCW; SVG is y-down
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const len = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) * scale
  return {
    x1: cx - (len / 2) * dx,
    y1: cy - (len / 2) * dy,
    x2: cx + (len / 2) * dx,
    y2: cy + (len / 2) * dy,
  }
}

/** Photoshop blend-mode names (ag-psd spelling) that CSS can reproduce. */
const BLEND_CSS: Record<string, string> = {
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color burn': 'color-burn',
  'color dodge': 'color-dodge',
  'soft light': 'soft-light',
  'hard light': 'hard-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
}

function blendStyle(
  mode: string | undefined,
  warnings: string[],
  allowPassThrough = false,
): string {
  if (!mode || mode === 'normal') return ''
  if (mode === 'pass through' || mode === 'passThrough') {
    if (!allowPassThrough) {
      warnings.push('blend mode "pass through" is group-only; rendered as normal')
    }
    return ''
  }
  const css = BLEND_CSS[mode]
  if (!css) {
    warnings.push(`blend mode "${mode}" has no CSS equivalent; rendered as normal`)
    return ''
  }
  return `mix-blend-mode:${css}`
}

interface Emitter {
  defs: string[]
  n: number
  width: number
  height: number
  geometry: WeakMap<Layer, Promise<PathGeometry>>
  patterns: PatternInfo[]
  patternPaints: Map<string, string>
}

// ---- gradient stop resampling (colour ramp + independent alpha ramp) ----

interface ColorStop {
  color: { r: number; g: number; b: number }
  location?: number
}
interface AlphaStop {
  opacity?: number
  location?: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function sampleColor(cs: ColorStop[], t: number) {
  if (t <= (cs[0].location ?? 0)) return cs[0].color
  const last = cs[cs.length - 1]
  if (t >= (last.location ?? 1)) return last.color
  for (let i = 1; i < cs.length; i++) {
    const l0 = cs[i - 1].location ?? 0
    const l1 = cs[i].location ?? 1
    if (t <= l1) {
      const u = l1 === l0 ? 0 : (t - l0) / (l1 - l0)
      return {
        r: lerp(cs[i - 1].color.r, cs[i].color.r, u),
        g: lerp(cs[i - 1].color.g, cs[i].color.g, u),
        b: lerp(cs[i - 1].color.b, cs[i].color.b, u),
      }
    }
  }
  return last.color
}

function sampleAlpha(os: AlphaStop[], t: number): number {
  if (!os.length) return 1
  if (t <= (os[0].location ?? 0)) return os[0].opacity ?? 1
  const last = os[os.length - 1]
  if (t >= (last.location ?? 1)) return last.opacity ?? 1
  for (let i = 1; i < os.length; i++) {
    const l0 = os[i - 1].location ?? 0
    const l1 = os[i].location ?? 1
    if (t <= l1) {
      const u = l1 === l0 ? 0 : (t - l0) / (l1 - l0)
      return lerp(os[i - 1].opacity ?? 1, os[i].opacity ?? 1, u)
    }
  }
  return last.opacity ?? 1
}

/** Build <stop> elements honouring colour stops, opacity stops, and reverse. */
function buildStops(content: any): string {
  const cs: ColorStop[] = [...(content.colorStops ?? [])].sort(
    (a, b) => (a.location ?? 0) - (b.location ?? 0),
  )
  if (!cs.length) return ''
  const os: AlphaStop[] = [...(content.opacityStops ?? [])].sort(
    (a, b) => (a.location ?? 0) - (b.location ?? 0),
  )
  const reverse = !!content.reverse
  const locs = [
    ...new Set([...cs, ...os].map((s) => +(s.location ?? 0))),
  ].sort((a, b) => a - b)
  const pts = locs.map((t) => ({
    t: reverse ? 1 - t : t,
    color: sampleColor(cs, t),
    alpha: sampleAlpha(os, t),
  }))
  pts.sort((a, b) => a.t - b.t)
  return pts
    .map((p) => {
      const off = Math.max(0, Math.min(100, p.t * 100))
      const op = p.alpha < 1 ? ` stop-opacity="${num(p.alpha)}"` : ''
      return `<stop offset="${num(off)}%" stop-color="${rgb(p.color)}"${op}/>`
    })
    .join('')
}

/**
 * A shape's paint (`vectorFill` or a `vectorStroke.content`) -> an SVG paint
 * string ("#rrggbb" or "url(#id)"). Registers a gradient def when needed.
 */
async function paint(
  content: any,
  bb: BBox,
  em: Emitter,
  warnings: string[],
): Promise<string> {
  if (!content) return 'none'
  if (content.type === 'color') return rgb(content.color)

  // 'solid' = a colour gradient; 'noise' = a noise gradient (approximate by
  // its colour stops). Both carry colorStops in ag-psd.
  if (content.type === 'solid' || content.type === 'noise') {
    const stopEls = buildStops(content)
    if (!stopEls) return '#808080'
    const style: string = content.style ?? 'linear'
    const id = `grad${em.n++}`

    if (style === 'radial') {
      const cx = (bb.l + bb.r) / 2
      const cy = (bb.t + bb.b) / 2
      const rad = (Math.max(bb.r - bb.l, bb.b - bb.t) / 2) * (content.scale ?? 1)
      em.defs.push(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
          `cx="${num(cx)}" cy="${num(cy)}" r="${num(rad)}">${stopEls}</radialGradient>`,
      )
      return `url(#${id})`
    }

    // linear; angle/reflected/diamond approximate as linear for v1.
    if (style !== 'linear') warnings.push(`gradient style "${style}" approximated as linear`)
    const e = gradientEndpoints(bb, content.angle ?? 0, content.scale ?? 1)
    em.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
        `x1="${num(e.x1)}" y1="${num(e.y1)}" x2="${num(e.x2)}" y2="${num(e.y2)}">` +
        `${stopEls}</linearGradient>`,
    )
    return `url(#${id})`
  }

  if (content.type === 'pattern') {
    const pattern = em.patterns.find(
      (candidate) => candidate.id === content.id || candidate.name === content.name,
    )
    if (!pattern?.bounds.w || !pattern.bounds.h || !pattern.data?.length) {
      warnings.push(
        `pattern "${content.name || content.id || '?'}" data not found; rendered transparent`,
      )
      return 'none'
    }
    const phaseX = content.phase?.x ?? 0
    const phaseY = content.phase?.y ?? 0
    const cacheKey = `${pattern.id}\0${phaseX}\0${phaseY}`
    const cached = em.patternPaints.get(cacheKey)
    if (cached) return `url(#${cached})`

    const id = `pattern${em.n++}`
    const href = await pngDataUri({
      width: pattern.bounds.w,
      height: pattern.bounds.h,
      data: pattern.data,
    })
    em.defs.push(
      `<pattern id="${id}" patternUnits="userSpaceOnUse" ` +
        `x="${num(phaseX)}" y="${num(phaseY)}" ` +
        `width="${pattern.bounds.w}" height="${pattern.bounds.h}">` +
        `<image width="${pattern.bounds.w}" height="${pattern.bounds.h}" href="${href}"/>` +
        `</pattern>`,
    )
    em.patternPaints.set(cacheKey, id)
    return `url(#${id})`
  }
  return 'none'
}

/** A single ag-psd subpath (knots) -> an SVG path `d` fragment. */
function subpathToD(sp: any): string {
  const k = sp?.knots
  if (!k?.length) return ''
  // ag-psd knot.points = [preCtrlX, preCtrlY, anchorX, anchorY, postCtrlX, postCtrlY]
  const anchor = (i: number) => [k[i].points[2], k[i].points[3]]
  const post = (i: number) => [k[i].points[4], k[i].points[5]]
  const pre = (i: number) => [k[i].points[0], k[i].points[1]]
  const pt = (p: number[]) => `${num(p[0])},${num(p[1])}`

  let d = `M ${pt(anchor(0))}`
  for (let i = 1; i < k.length; i++) {
    d += ` C ${pt(post(i - 1))} ${pt(pre(i))} ${pt(anchor(i))}`
  }
  if (!sp.open) {
    // close: curve from last anchor back to the first
    d += ` C ${pt(post(k.length - 1))} ${pt(pre(0))} ${pt(anchor(0))} Z`
  }
  return d
}

type Point = [number, number]

interface PathGeometry {
  d: string
  evenOdd: boolean
}

const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

function distanceToLine(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (!length) return Math.hypot(point[0] - start[0], point[1] - start[1])
  return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / length
}

/** Adaptively flatten one cubic Bézier to sub-pixel line segments. */
function flattenCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  out: Point[],
  depth = 0,
) {
  if (
    depth >= 12 ||
    Math.max(distanceToLine(p1, p0, p3), distanceToLine(p2, p0, p3)) <= 0.25
  ) {
    out.push(p3)
    return
  }
  const p01 = midpoint(p0, p1)
  const p12 = midpoint(p1, p2)
  const p23 = midpoint(p2, p3)
  const p012 = midpoint(p01, p12)
  const p123 = midpoint(p12, p23)
  const p0123 = midpoint(p012, p123)
  flattenCubic(p0, p01, p012, p0123, out, depth + 1)
  flattenCubic(p0123, p123, p23, p3, out, depth + 1)
}

function flattenSubpath(sp: any): Point[] {
  const knots = sp?.knots
  if (!knots?.length) return []
  const anchor = (i: number): Point => [knots[i].points[2], knots[i].points[3]]
  const post = (i: number): Point => [knots[i].points[4], knots[i].points[5]]
  const pre = (i: number): Point => [knots[i].points[0], knots[i].points[1]]
  const points: Point[] = [anchor(0)]
  for (let i = 1; i < knots.length; i++) {
    flattenCubic(anchor(i - 1), post(i - 1), pre(i), anchor(i), points)
  }
  if (!sp.open) {
    flattenCubic(
      anchor(knots.length - 1),
      post(knots.length - 1),
      pre(0),
      anchor(0),
      points,
    )
  }
  return points
}

function multiPolygonToD(multiPolygon: Point[][][]): string {
  const parts: string[] = []
  for (const polygon of multiPolygon) {
    for (const ring of polygon) {
      if (ring.length < 4) continue
      const end =
        ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
          ? ring.length - 1
          : ring.length
      if (end < 3) continue
      let d = `M ${num(ring[0][0])},${num(ring[0][1])}`
      for (let i = 1; i < end; i++) d += ` L ${num(ring[i][0])},${num(ring[i][1])}`
      parts.push(`${d} Z`)
    }
  }
  return parts.join(' ')
}

/**
 * Resolve Photoshop's sequential path operations. We keep native cubic output
 * for ordinary paths; only shapes containing `intersect` are flattened and sent
 * through the lazy clipping engine.
 */
async function computePathGeometry(paths: any[], warnings: string[]): Promise<PathGeometry> {
  const operations = paths.map((path) => path.operation)
  if (!operations.includes('intersect')) {
    return {
      d: paths.map(subpathToD).filter(Boolean).join(' '),
      evenOdd:
        paths.some((path) => path.fillRule === 'even-odd') ||
        operations.some((operation) => operation === 'subtract' || operation === 'exclude'),
    }
  }

  try {
    if (paths.some((path) => path.open)) {
      throw new Error('open subpaths cannot participate in a filled intersection')
    }
    const clipping = await import('polygon-clipping')
    let result: Point[][][] = []
    let started = false
    for (const path of paths) {
      const ring = flattenSubpath(path)
      if (ring.length < 4) continue
      const operand: Point[][][] = [[ring]]
      if (!started) {
        result = operand
        started = true
        continue
      }
      switch (path.operation ?? 'combine') {
        case 'subtract':
          result = clipping.difference(result, operand)
          break
        case 'intersect':
          result = clipping.intersection(result, operand)
          break
        case 'exclude':
          result = clipping.xor(result, operand)
          break
        default:
          result = clipping.union(result, operand)
      }
    }
    return { d: multiPolygonToD(result), evenOdd: true }
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : ''
    warnings.push(`path "intersect" combine mode failed${detail}; approximated with fill rules`)
    return {
      d: paths.map(subpathToD).filter(Boolean).join(' '),
      evenOdd: true,
    }
  }
}

function pathGeometry(layer: Layer, em: Emitter, warnings: string[]): Promise<PathGeometry> {
  const existing = em.geometry.get(layer)
  if (existing) return existing
  const paths = (layer as any).vectorMask?.paths as any[] | undefined
  const pending = computePathGeometry(paths ?? [], warnings)
  em.geometry.set(layer, pending)
  return pending
}

const gray = (value: number) => `#${hex2(value)}${hex2(value)}${hex2(value)}`

function adjustedMaskPixels(image: PixelData, density: number): PixelData {
  const data = new Uint8Array(image.width * image.height * 4)
  for (let i = 0; i < image.width * image.height; i++) {
    const source = pixelByte(image.data, i * 4)
    const value = clamp8(255 * (1 - density) + source * density)
    const offset = i * 4
    data[offset] = value
    data[offset + 1] = value
    data[offset + 2] = value
    data[offset + 3] = 255
  }
  return { width: image.width, height: image.height, data }
}

function maskBlur(feather: number | undefined, em: Emitter): string {
  if (!feather || feather <= 0) return ''
  const id = `maskBlur${em.n++}`
  em.defs.push(
    `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" ` +
      `width="${em.width}" height="${em.height}">` +
      `<feGaussianBlur stdDeviation="${num(feather)}"/></filter>`,
  )
  return ` filter="url(#${id})"`
}

async function bitmapMaskId(
  layer: Layer,
  mask: LayerMaskData,
  em: Emitter,
): Promise<string> {
  const density = Math.max(0, Math.min(1, mask.userMaskDensity ?? 1))
  const defaultValue = clamp8(255 * (1 - density) + (mask.defaultColor ?? 0) * density)
  const id = `mask${em.n++}`
  const contents = [
    `<rect x="0" y="0" width="${em.width}" height="${em.height}" fill="${gray(defaultValue)}"/>`,
  ]
  if (mask.imageData?.width && mask.imageData.height) {
    const x = (mask.left ?? 0) + (mask.positionRelativeToLayer ? layer.left ?? 0 : 0)
    const y = (mask.top ?? 0) + (mask.positionRelativeToLayer ? layer.top ?? 0 : 0)
    const href = await pngDataUri(adjustedMaskPixels(mask.imageData, density))
    contents.push(
      `<image x="${num(x)}" y="${num(y)}" width="${mask.imageData.width}" ` +
        `height="${mask.imageData.height}" href="${href}"${maskBlur(mask.userMaskFeather, em)}/>`,
    )
  }
  em.defs.push(
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" ` +
      `width="${em.width}" height="${em.height}" mask-type="luminance" ` +
      `style="mask-type:luminance">${contents.join('')}</mask>`,
  )
  return id
}

async function vectorMaskId(
  layer: Layer,
  em: Emitter,
  warnings: string[],
): Promise<string | undefined> {
  const vectorMask = layer.vectorMask
  if (!vectorMask?.paths.length || vectorMask.disable) return undefined
  const geometry = await pathGeometry(layer, em, warnings)
  const settings =
    (layer.mask?.fromVectorData ? layer.mask : undefined) ??
    (layer.realMask?.fromVectorData ? layer.realMask : undefined)
  const density = Math.max(0, Math.min(1, settings?.vectorMaskDensity ?? 1))
  const feather = settings?.vectorMaskFeather
  const low = gray(255 * (1 - density))
  const inverted = !!vectorMask.invert
  const id = `mask${em.n++}`
  const background = inverted ? '#ffffff' : low
  const pathFill = inverted ? low : '#ffffff'
  const fillRule = geometry.evenOdd ? ' fill-rule="evenodd"' : ''
  const blur = maskBlur(feather, em)
  em.defs.push(
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" ` +
      `width="${em.width}" height="${em.height}" mask-type="luminance" ` +
      `style="mask-type:luminance">` +
      `<rect x="0" y="0" width="${em.width}" height="${em.height}" fill="${background}"/>` +
      `<path d="${geometry.d}" fill="${pathFill}"${fillRule}${blur}/></mask>`,
  )
  return id
}

async function appendWithMasks(
  layer: Layer,
  lines: string[],
  out: string[],
  em: Emitter,
  warnings: string[],
  vectorMaskIsArtwork: boolean,
) {
  const maskIds: string[] = []
  if (layer.mask && !layer.mask.disabled && !layer.mask.fromVectorData) {
    maskIds.push(await bitmapMaskId(layer, layer.mask, em))
  }
  if (layer.realMask && !layer.realMask.disabled && !layer.realMask.fromVectorData) {
    maskIds.push(await bitmapMaskId(layer, layer.realMask, em))
  }
  if (!vectorMaskIsArtwork) {
    const id = await vectorMaskId(layer, em, warnings)
    if (id) maskIds.push(id)
  }

  let wrapped = lines
  for (const id of maskIds) {
    wrapped = [`  <g mask="url(#${id})">`, ...wrapped, '  </g>']
  }
  out.push(...wrapped)
}

interface ShapeOut {
  markup: string
  /** clip geometry: the path data + rule, for use as a clipPath base */
  d: string
  evenOdd: boolean
}

/** Render the stored pixels for a raster, text, or smart-object layer. */
async function renderRaster(
  layer: Layer,
  warnings: string[],
): Promise<string | null> {
  const image = layer.imageData
  if (!image?.width || !image.height) return null

  const attrs = [
    `x="${num(layer.left ?? 0)}"`,
    `y="${num(layer.top ?? 0)}"`,
    `width="${image.width}"`,
    `height="${image.height}"`,
    `href="${await pngDataUri(image)}"`,
  ]
  const op = layer.opacity ?? 1
  if (op < 1) attrs.push(`opacity="${num(op)}"`)
  const blend = blendStyle(layer.blendMode, warnings)
  if (blend) attrs.push(`style="${blend}"`)
  return `  <image ${attrs.join(' ')}/>`
}

/** Render one shape layer to markup (not yet pushed). Null if not a shape. */
async function renderShape(
  layer: Layer,
  em: Emitter,
  warnings: string[],
): Promise<ShapeOut | null> {
  const paths = (layer as any).vectorMask?.paths as any[] | undefined
  if (!paths?.length || (!layer.vectorFill && !layer.vectorStroke)) return null
  const geometry = await pathGeometry(layer, em, warnings)
  const { d, evenOdd } = geometry

  const bb: BBox = {
    l: layer.left ?? 0,
    t: layer.top ?? 0,
    r: layer.right ?? 0,
    b: layer.bottom ?? 0,
  }
  const stroke = (layer as any).vectorStroke
  const hasStroke = !!stroke?.strokeEnabled && !!stroke?.content
  const fillOn = hasStroke ? stroke.fillEnabled : true

  const attrs: string[] = []

  const fillContent = (layer as any).vectorFill
  attrs.push(
    `fill="${
      fillOn && fillContent ? await paint(fillContent, bb, em, warnings) : 'none'
    }"`,
  )

  if (evenOdd) attrs.push(`fill-rule="evenodd"`)

  if (hasStroke) {
    attrs.push(`stroke="${await paint(stroke.content, bb, em, warnings)}"`)
    attrs.push(`stroke-width="${num(stroke.lineWidth?.value ?? 1)}"`)
    if (stroke.lineCapType) attrs.push(`stroke-linecap="${stroke.lineCapType}"`)
    if (stroke.lineJoinType) attrs.push(`stroke-linejoin="${stroke.lineJoinType}"`)
  }

  const op = layer.opacity ?? 1
  if (op < 1) attrs.push(`opacity="${num(op)}"`)
  const blend = blendStyle((layer as any).blendMode, warnings)
  if (blend) attrs.push(`style="${blend}"`)

  return { markup: `  <path d="${d}" ${attrs.join(' ')}/>`, d, evenOdd }
}

/** Collect clip geometry from a layer (shape) or all shapes under a group. */
async function collectClipGeometry(
  layer: Layer,
  em: Emitter,
  warnings: string[],
): Promise<{ d: string; evenOdd: boolean }[]> {
  const out: { d: string; evenOdd: boolean }[] = []
  const visit = async (l: Layer) => {
    if (l.hidden) return
    const paths = (l as any).vectorMask?.paths as any[] | undefined
    if (paths?.length) {
      const geometry = await pathGeometry(l, em, warnings)
      if (geometry.d) out.push(geometry)
    }
    for (const c of l.children ?? []) await visit(c)
  }
  await visit(layer)
  return out
}

interface Counts {
  drawn: number
  skipped: number
}

/** Emit one node (shape leaf or group) into `out`. */
async function emitNode(
  layer: Layer,
  out: string[],
  em: Emitter,
  warnings: string[],
  counts: Counts,
): Promise<void> {
  if (layer.children?.length) {
    const inner: string[] = []
    await walk(layer.children, inner, em, warnings, counts)
    const op = layer.opacity ?? 1
    const blend = blendStyle((layer as any).blendMode, warnings, true)
    if (op < 1 || blend) {
      const attrs: string[] = []
      if (op < 1) attrs.push(`opacity="${num(op)}"`)
      if (blend) attrs.push(`style="${blend};isolation:isolate"`)
      await appendWithMasks(
        layer,
        [`  <g ${attrs.join(' ')}>`, ...inner, '  </g>'],
        out,
        em,
        warnings,
        false,
      )
    } else {
      await appendWithMasks(layer, inner, out, em, warnings, false)
    }
    return
  }
  const shape = await renderShape(layer, em, warnings)
  if (shape) {
    if (shape.markup) {
      await appendWithMasks(layer, [shape.markup], out, em, warnings, true)
    }
    counts.drawn++
    return
  }
  const raster = await renderRaster(layer, warnings)
  if (raster) {
    await appendWithMasks(layer, [raster], out, em, warnings, false)
    counts.drawn++
    return
  }
  counts.skipped++ // adjustment / unsupported layer with no renderable pixels
}

/**
 * Emit a base layer's run of clipped layers, either clipped to the base's
 * vector geometry or unclipped (with a warning) when the base has none.
 */
async function emitClippedRun(
  layer: Layer,
  run: Layer[],
  out: string[],
  em: Emitter,
  warnings: string[],
  counts: Counts,
): Promise<void> {
  const geo = await collectClipGeometry(layer, em, warnings)
  if (!geo.length) {
    warnings.push(
      `clipping base "${layer.name ?? '?'}" has no vector path; clipped layer(s) rendered unclipped`,
    )
    for (const l of run) await emitNode(l, out, em, warnings, counts)
    return
  }
  const id = `clip${em.n++}`
  em.defs.push(
    `<clipPath id="${id}">` +
      geo.map((g) => `<path d="${g.d}"${g.evenOdd ? ' clip-rule="evenodd"' : ''}/>`).join('') +
      `</clipPath>`,
  )
  const inner: string[] = []
  for (const l of run) await emitNode(l, inner, em, warnings, counts)
  out.push(`  <g clip-path="url(#${id})">`)
  out.push(...inner)
  out.push('  </g>')
}

/**
 * Walk one children array (bottom-to-top). Runs of `clipping: true` layers are
 * clipped to the nearest non-clipping layer before them.
 */
async function walk(
  layers: Layer[],
  out: string[],
  em: Emitter,
  warnings: string[],
  counts: Counts,
): Promise<void> {
  let i = 0
  while (i < layers.length) {
    const layer = layers[i]
    if (layer.hidden) {
      i++
      continue
    }
    // Collect the run of clipped layers stacked on this base.
    const run: Layer[] = []
    let j = i + 1
    while (j < layers.length && (layers[j] as any).clipping) {
      if (!layers[j].hidden) run.push(layers[j])
      j++
    }

    if ((layer as any).clipping) {
      // A clipped layer with no visible base below it (base hidden or first in
      // stack): Photoshop hides it too when the base is hidden; if the base
      // was simply absent, render normally.
      await emitNode(layer, out, em, warnings, counts)
      i++
      continue
    }

    await emitNode(layer, out, em, warnings, counts)

    if (run.length) {
      await emitClippedRun(layer, run, out, em, warnings, counts)
    }
    i = j
  }
}

export async function psdToSvg(bytes: ArrayBuffer): Promise<PsdConvertResult> {
  const warnings: string[] = []
  const psd = readPsd(bytes, {
    useImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  })
  const w = psd.width
  const h = psd.height

  const patterns: PatternInfo[] = []
  const collectPatterns = (layer: Layer) => {
    patterns.push(...(layer.patterns ?? []))
    for (const child of layer.children ?? []) collectPatterns(child)
  }
  patterns.push(...(psd.patterns ?? []))
  for (const child of psd.children ?? []) collectPatterns(child)

  const em: Emitter = {
    defs: [],
    n: 0,
    width: w,
    height: h,
    geometry: new WeakMap(),
    patterns,
    patternPaints: new Map(),
  }
  const body: string[] = []
  const counts: Counts = { drawn: 0, skipped: 0 }
  await walk(psd.children ?? [], body, em, warnings, counts)

  if (counts.skipped) {
    warnings.push(
      `${counts.skipped} unsupported layer(s) skipped because they contain no renderable pixels.`,
    )
  }

  const defs = em.defs.length ? `  <defs>\n    ${em.defs.join('\n    ')}\n  </defs>\n` : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}">\n${defs}${body.join('\n')}\n</svg>\n`

  return {
    svg,
    warnings: [...new Set(warnings)],
    meta: { width: w, height: h, layers: counts.drawn, skipped: counts.skipped },
  }
}
