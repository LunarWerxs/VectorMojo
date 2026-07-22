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

import { readPsd, type Layer } from 'ag-psd'

export interface PsdConvertResult {
  svg: string
  warnings: string[]
  meta: { width: number; height: number; layers: number; skipped: number }
}

const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
const hex2 = (v: number) => clamp8(v).toString(16).padStart(2, '0')
const rgb = (c: { r: number; g: number; b: number }) =>
  `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`

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

function blendStyle(mode: string | undefined, warnings: string[]): string {
  if (!mode || mode === 'normal' || mode === 'pass through' || mode === 'passThrough') return ''
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
function paint(content: any, bb: BBox, em: Emitter, warnings: string[]): string {
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
    warnings.push('pattern fill not supported yet; rendered transparent')
    return 'none'
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

interface ShapeOut {
  markup: string
  /** clip geometry: the path data + rule, for use as a clipPath base */
  d: string
  evenOdd: boolean
}

/** Render one shape layer to markup (not yet pushed). Null if not a shape. */
function renderShape(layer: Layer, em: Emitter, warnings: string[]): ShapeOut | null {
  const paths = (layer as any).vectorMask?.paths as any[] | undefined
  if (!paths?.length) return null
  const d = paths.map(subpathToD).filter(Boolean).join(' ')
  if (!d) return null

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
  attrs.push(`fill="${fillOn && fillContent ? paint(fillContent, bb, em, warnings) : 'none'}"`)

  // Photoshop combine semantics: explicit subtract/exclude subpaths punch
  // holes regardless of winding direction -- even-odd is the closest SVG
  // fill rule. 'intersect' has no fill-rule equivalent; warn.
  const ops = paths.map((p) => p.operation)
  const evenOdd =
    paths.some((p) => p.fillRule === 'even-odd') ||
    ops.some((o) => o === 'subtract' || o === 'exclude')
  if (ops.some((o) => o === 'intersect'))
    warnings.push('path "intersect" combine mode approximated; check that shape')
  if (evenOdd) attrs.push(`fill-rule="evenodd"`)

  if (hasStroke) {
    attrs.push(`stroke="${paint(stroke.content, bb, em, warnings)}"`)
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
function collectClipGeometry(layer: Layer): { d: string; evenOdd: boolean }[] {
  const out: { d: string; evenOdd: boolean }[] = []
  const visit = (l: Layer) => {
    if (l.hidden) return
    const paths = (l as any).vectorMask?.paths as any[] | undefined
    if (paths?.length) {
      const d = paths.map(subpathToD).filter(Boolean).join(' ')
      if (d) out.push({ d, evenOdd: paths.some((p) => p.fillRule === 'even-odd') })
    }
    for (const c of l.children ?? []) visit(c)
  }
  visit(layer)
  return out
}

interface Counts {
  drawn: number
  skipped: number
}

/** Emit one node (shape leaf or group) into `out`. */
function emitNode(
  layer: Layer,
  out: string[],
  em: Emitter,
  warnings: string[],
  counts: Counts,
) {
  if (layer.children?.length) {
    const inner: string[] = []
    walk(layer.children, inner, em, warnings, counts)
    const op = layer.opacity ?? 1
    const blend = blendStyle((layer as any).blendMode, warnings)
    if (op < 1 || blend) {
      const attrs: string[] = []
      if (op < 1) attrs.push(`opacity="${num(op)}"`)
      if (blend) attrs.push(`style="${blend};isolation:isolate"`)
      out.push(`  <g ${attrs.join(' ')}>`)
      out.push(...inner)
      out.push('  </g>')
    } else {
      out.push(...inner)
    }
    return
  }
  const shape = renderShape(layer, em, warnings)
  if (shape) {
    out.push(shape.markup)
    counts.drawn++
  } else {
    counts.skipped++ // raster / text / unsupported layer (v1: shapes only)
  }
}

/**
 * Walk one children array (bottom-to-top). Runs of `clipping: true` layers are
 * clipped to the nearest non-clipping layer before them.
 */
function walk(
  layers: Layer[],
  out: string[],
  em: Emitter,
  warnings: string[],
  counts: Counts,
) {
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
      emitNode(layer, out, em, warnings, counts)
      i++
      continue
    }

    emitNode(layer, out, em, warnings, counts)

    if (run.length) {
      const geo = collectClipGeometry(layer)
      if (!geo.length) {
        warnings.push(
          `clipping base "${layer.name ?? '?'}" has no vector path; clipped layer(s) rendered unclipped`,
        )
        for (const l of run) emitNode(l, out, em, warnings, counts)
      } else {
        const id = `clip${em.n++}`
        em.defs.push(
          `<clipPath id="${id}">` +
            geo
              .map((g) => `<path d="${g.d}"${g.evenOdd ? ' clip-rule="evenodd"' : ''}/>`)
              .join('') +
            `</clipPath>`,
        )
        const inner: string[] = []
        for (const l of run) emitNode(l, inner, em, warnings, counts)
        out.push(`  <g clip-path="url(#${id})">`)
        out.push(...inner)
        out.push('  </g>')
      }
    }
    i = j
  }
}

export function psdToSvg(bytes: ArrayBuffer): PsdConvertResult {
  const warnings: string[] = []
  const psd = readPsd(bytes, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  })
  const w = psd.width
  const h = psd.height

  const em: Emitter = { defs: [], n: 0 }
  const body: string[] = []
  const counts: Counts = { drawn: 0, skipped: 0 }
  walk(psd.children ?? [], body, em, warnings, counts)

  if (counts.skipped) {
    warnings.push(
      `${counts.skipped} non-vector layer(s) skipped (v1 renders shape layers only).`,
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
