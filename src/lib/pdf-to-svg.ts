// PDF (and modern PDF-compatible Illustrator files) -> SVG via MuPDF.js.
// The module is lazy-loaded from the registry so its ~10 MB WASM runtime is
// fetched only when one of these formats is actually converted.
import * as mupdf from 'mupdf'
import type { ToSvgResult } from './registry'

function drawPageAsSvg(document: mupdf.Document, pageNumber: number): string {
  const page = document.loadPage(pageNumber)
  const buffer = new mupdf.Buffer()
  const writer = new mupdf.DocumentWriter(buffer, 'svg', '')
  let device: mupdf.Device | undefined
  try {
    device = writer.beginPage(page.getBounds())
    page.run(device, mupdf.Matrix.identity)
    device.close()
    writer.endPage()
    return buffer.asString()
  } finally {
    device?.destroy()
    writer.destroy()
    buffer.destroy()
    page.destroy()
  }
}

export async function pdfToSvg(bytes: ArrayBuffer, pageNumber = 0): Promise<ToSvgResult> {
  const document = mupdf.Document.openDocument(bytes, 'application/pdf')
  try {
    if (document.needsPassword()) {
      throw new Error('This PDF is password-protected.')
    }
    const pages = document.countPages()
    if (!pages) throw new Error('The document contains no pages.')
    if (!Number.isInteger(pageNumber) || pageNumber < 0 || pageNumber >= pages) {
      throw new Error(`Page ${pageNumber + 1} is outside this ${pages}-page document.`)
    }

    const page = document.loadPage(pageNumber)
    const bounds = page.getBounds()
    page.destroy()
    const width = bounds[2] - bounds[0]
    const height = bounds[3] - bounds[1]
    const pageLabel = pageNumber + 1

    return {
      svg: drawPageAsSvg(document, pageNumber),
      warnings: [],
      meta: {
        width,
        height,
        pages,
        page: pageLabel,
        summary: pages === 1 ? '1 page' : `page ${pageLabel} of ${pages}`,
      },
    }
  } finally {
    document.destroy()
  }
}
