// Generate the neutral PSD bundled with the public demo.
//
// The artwork is deliberately made only from vector shape layers so it is both
// brand-free and a useful smoke test for the PSD -> SVG converter.
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  writePsdBuffer,
  type BezierKnot,
  type BezierPath,
  type Layer,
  type Psd,
  type VectorContent,
} from 'ag-psd'

const WIDTH = 1200
const HEIGHT = 800
const KAPPA = 0.5522847498307936

interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

interface Point {
  x: number
  y: number
}

const rgb = (hex: string) => {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  }
}

const knot = (
  anchor: Point,
  pre: Point = anchor,
  post: Point = anchor,
): BezierKnot => ({
  linked: true,
  points: [pre.x, pre.y, anchor.x, anchor.y, post.x, post.y],
})

function polygon(points: Point[], operation: BezierPath['operation'] = 'combine'): BezierPath {
  return {
    open: false,
    operation,
    fillRule: 'non-zero',
    knots: points.map((point) => knot(point)),
  }
}

function roundedRect(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  const c = r * KAPPA
  return {
    open: false,
    operation: 'combine' as const,
    fillRule: 'non-zero' as const,
    knots: [
      knot({ x: x + r, y }, { x: x + r - c, y }),
      knot({ x: x + width - r, y }, undefined, { x: x + width - r + c, y }),
      knot({ x: x + width, y: y + r }, { x: x + width, y: y + r - c }),
      knot(
        { x: x + width, y: y + height - r },
        undefined,
        { x: x + width, y: y + height - r + c },
      ),
      knot(
        { x: x + width - r, y: y + height },
        { x: x + width - r + c, y: y + height },
      ),
      knot({ x: x + r, y: y + height }, undefined, { x: x + r - c, y: y + height }),
      knot({ x, y: y + height - r }, { x, y: y + height - r + c }),
      knot({ x, y: y + r }, undefined, { x, y: y + r - c }),
    ],
  } satisfies BezierPath
}

function circle(
  cx: number,
  cy: number,
  radius: number,
  operation: BezierPath['operation'] = 'combine',
): BezierPath {
  const c = radius * KAPPA
  return {
    open: false,
    operation,
    fillRule: 'non-zero',
    knots: [
      knot({ x: cx, y: cy - radius }, { x: cx - c, y: cy - radius }, { x: cx + c, y: cy - radius }),
      knot({ x: cx + radius, y: cy }, { x: cx + radius, y: cy - c }, { x: cx + radius, y: cy + c }),
      knot({ x: cx, y: cy + radius }, { x: cx + c, y: cy + radius }, { x: cx - c, y: cy + radius }),
      knot({ x: cx - radius, y: cy }, { x: cx - radius, y: cy + c }, { x: cx - radius, y: cy - c }),
    ],
  }
}

function star(cx: number, cy: number, outer: number, inner: number, points = 8) {
  const vertices: Point[] = []
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (i * Math.PI) / points
    vertices.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius })
  }
  return polygon(vertices)
}

function gradient(
  name: string,
  colors: { at: number; hex: string }[],
  options: { style?: 'linear' | 'radial'; angle?: number; scale?: number } = {},
): VectorContent {
  return {
    type: 'solid',
    name,
    smoothness: 1,
    colorStops: colors.map(({ at, hex }) => ({
      color: rgb(hex),
      location: at,
      midpoint: 0.5,
    })),
    opacityStops: [
      { opacity: 1, location: 0, midpoint: 0.5 },
      { opacity: 1, location: 1, midpoint: 0.5 },
    ],
    style: options.style ?? 'linear',
    angle: options.angle ?? 0,
    scale: options.scale ?? 1,
    align: true,
  }
}

function transparentPixels(bounds: Bounds) {
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top
  return { width, height, data: new Uint8Array(width * height * 4) }
}

function shapeLayer(
  name: string,
  bounds: Bounds,
  paths: BezierPath[],
  fill: VectorContent,
  options: Pick<Layer, 'opacity' | 'blendMode'> = {},
): Layer {
  return {
    name,
    left: bounds.left,
    top: bounds.top,
    right: bounds.right,
    bottom: bounds.bottom,
    imageData: transparentPixels(bounds),
    vectorFill: fill,
    vectorMask: { fillStartsWithAllPixels: false, paths },
    ...options,
  }
}

function strokeLayer(
  name: string,
  bounds: Bounds,
  path: BezierPath,
  content: VectorContent,
  width: number,
): Layer {
  return {
    ...shapeLayer(name, bounds, [path], { type: 'color', color: rgb('#ffffff') }),
    vectorStroke: {
      strokeEnabled: true,
      fillEnabled: false,
      lineWidth: { units: 'Pixels', value: width },
      lineCapType: 'round',
      lineJoinType: 'round',
      lineAlignment: 'center',
      opacity: 1,
      content,
      resolution: 72,
    },
  }
}

function compositePixels() {
  const data = new Uint8Array(WIDTH * HEIGHT * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 15
    data[i + 1] = 23
    data[i + 2] = 42
    data[i + 3] = 255
  }
  return { width: WIDTH, height: HEIGHT, data }
}

const route: BezierPath = {
  open: true,
  fillRule: 'non-zero',
  knots: [
    knot({ x: 165, y: 580 }, undefined, { x: 330, y: 410 }),
    knot({ x: 575, y: 520 }, { x: 410, y: 560 }, { x: 700, y: 480 }),
    knot({ x: 1035, y: 225 }, { x: 855, y: 300 }),
  ],
}

const psd: Psd = {
  width: WIDTH,
  height: HEIGHT,
  imageData: compositePixels(),
  children: [
    shapeLayer(
      'Midnight canvas',
      { left: 40, top: 40, right: 1160, bottom: 760 },
      [roundedRect(40, 40, 1120, 720, 52)],
      gradient(
        'Nightfall',
        [
          { at: 0, hex: '#111827' },
          { at: 0.55, hex: '#312e81' },
          { at: 1, hex: '#581c87' },
        ],
        { angle: -25, scale: 1.15 },
      ),
    ),
    shapeLayer(
      'Violet ribbon',
      { left: 65, top: 425, right: 1135, bottom: 735 },
      [
        {
          open: false,
          operation: 'combine',
          fillRule: 'non-zero',
          knots: [
            knot({ x: 65, y: 615 }, undefined, { x: 290, y: 470 }),
            knot({ x: 570, y: 520 }, { x: 395, y: 570 }, { x: 760, y: 470 }),
            knot({ x: 1135, y: 425 }, { x: 960, y: 500 }),
            knot({ x: 1135, y: 735 }),
            knot({ x: 65, y: 735 }),
          ],
        },
      ],
      gradient(
        'Violet current',
        [
          { at: 0, hex: '#7c3aed' },
          { at: 0.55, hex: '#c026d3' },
          { at: 1, hex: '#fb7185' },
        ],
        { angle: 8 },
      ),
      { opacity: 0.78, blendMode: 'screen' },
    ),
    shapeLayer(
      'Cyan glow',
      { left: 675, top: 135, right: 1105, bottom: 565 },
      [circle(890, 350, 215)],
      gradient(
        'Cyan radial',
        [
          { at: 0, hex: '#67e8f9' },
          { at: 0.58, hex: '#3b82f6' },
          { at: 1, hex: '#312e81' },
        ],
        { style: 'radial', scale: 1 },
      ),
      { opacity: 0.72, blendMode: 'screen' },
    ),
    shapeLayer(
      'Orbit',
      { left: 730, top: 190, right: 1050, bottom: 510 },
      [circle(890, 350, 160), circle(890, 350, 125, 'subtract')],
      { type: 'color', color: rgb('#e0f2fe') },
      { opacity: 0.5 },
    ),
    strokeLayer(
      'Gradient route',
      { left: 145, top: 200, right: 1055, bottom: 600 },
      route,
      gradient(
        'Route spectrum',
        [
          { at: 0, hex: '#fbbf24' },
          { at: 0.45, hex: '#fb7185' },
          { at: 1, hex: '#22d3ee' },
        ],
        { angle: 18 },
      ),
      28,
    ),
    shapeLayer(
      'Start node',
      { left: 125, top: 540, right: 205, bottom: 620 },
      [circle(165, 580, 40)],
      { type: 'color', color: rgb('#fbbf24') },
    ),
    shapeLayer(
      'Finish node',
      { left: 995, top: 185, right: 1075, bottom: 265 },
      [circle(1035, 225, 40)],
      { type: 'color', color: rgb('#67e8f9') },
    ),
    shapeLayer(
      'Vector spark',
      { left: 170, top: 145, right: 350, bottom: 325 },
      [star(260, 235, 90, 38)],
      gradient(
        'Spark',
        [
          { at: 0, hex: '#fde68a' },
          { at: 0.55, hex: '#fb923c' },
          { at: 1, hex: '#f43f5e' },
        ],
        { angle: -45 },
      ),
    ),
  ],
}

const output = resolve(process.argv[2] ?? 'public/samples/vector-mojo-sample.psd')
await mkdir(dirname(output), { recursive: true })
await Bun.write(output, writePsdBuffer(psd, { compress: true, generateThumbnail: false }))
console.log(`Generated ${output}`)
