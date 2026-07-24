// EPS / PostScript -> PDF through Ghostscript WASM, then PDF -> SVG through
// MuPDF. Both engines are reached only through the registry's lazy import.
// The package's gs.mjs wrapper expects a global `createModule` that Rollup
// cannot preserve. Its underlying browser/CommonJS entry exports the same
// Emscripten factory without that brittle global handoff.
import createGhostscript from '@jspawn/ghostscript-wasm/gs.js'
import ghostscriptWasmUrl from '@jspawn/ghostscript-wasm/gs.wasm?url'
import type { ToSvgResult } from './registry'

export async function epsToSvg(bytes: ArrayBuffer): Promise<ToSvgResult> {
  const ghostscript = await createGhostscript({
    locateFile: (path) => (path.endsWith('.wasm') ? ghostscriptWasmUrl : path),
  })

  ghostscript.FS.mkdir('/vectormojo')
  ghostscript.FS.writeFile('/vectormojo/input.eps', new Uint8Array(bytes))

  let status: number
  try {
    status = await ghostscript.callMain([
      '-q',
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-dEPSCrop',
      '-dAutoRotatePages=/None',
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.7',
      '-sOutputFile=/vectormojo/output.pdf',
      '/vectormojo/input.eps',
    ])
  } catch (error) {
    throw new Error(
      'Ghostscript could not convert this EPS/PostScript file: ' +
        (error instanceof Error ? error.message : String(error)),
    )
  }

  if (status !== 0) {
    throw new Error(`Ghostscript could not convert this EPS/PostScript file (status ${status}).`)
  }

  const pdfBytes = ghostscript.FS.readFile('/vectormojo/output.pdf')
  if (pdfBytes.length < 5) {
    throw new Error('Ghostscript produced an empty PDF.')
  }

  // Copy out of Emscripten's live heap before handing ownership to MuPDF.
  const pdf = pdfBytes.slice().buffer
  const { pdfToSvg } = await import('./pdf-to-svg')
  const result = await pdfToSvg(pdf)
  return {
    ...result,
    meta: { ...result.meta, source: 'eps' },
  }
}
