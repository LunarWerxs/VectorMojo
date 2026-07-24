import { describe, expect, test } from 'bun:test'
import { detect } from '../src/lib/detect'
import { pdfToSvg } from '../src/lib/pdf-to-svg'

function onePagePdf(): ArrayBuffer {
  const content = '0.1 0.3 0.9 rg\n10 10 80 40 re f\n'
  let pdf = '%PDF-1.4\n%\x80\x81\x82\x83\n'
  const offsets = [0]
  const object = (number: number, body: string) => {
    offsets[number] = pdf.length
    pdf += `${number} 0 obj\n${body}\nendobj\n`
  }
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 60] /Resources << >> /Contents 4 0 R >>',
  )
  object(4, `<< /Length ${content.length} >>\nstream\n${content}endstream`)
  const xref = pdf.length
  pdf += `xref\n0 5\n0000000000 65535 f \n`
  for (let i = 1; i <= 4; i++) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(pdf, (character) => character.charCodeAt(0)).buffer
}

function twoPagePdf(): ArrayBuffer {
  const firstContent = '0.1 0.3 0.9 rg\n10 10 80 40 re f\n'
  const secondContent = '0.9 0.2 0.1 rg\n5 15 70 90 re f\n'
  let pdf = '%PDF-1.4\n%\x80\x81\x82\x83\n'
  const offsets = [0]
  const object = (number: number, body: string) => {
    offsets[number] = pdf.length
    pdf += `${number} 0 obj\n${body}\nendobj\n`
  }
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>')
  object(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 60] /Resources << >> /Contents 4 0 R >>',
  )
  object(4, `<< /Length ${firstContent.length} >>\nstream\n${firstContent}endstream`)
  object(
    5,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 80 120] /Resources << >> /Contents 6 0 R >>',
  )
  object(6, `<< /Length ${secondContent.length} >>\nstream\n${secondContent}endstream`)
  const xref = pdf.length
  pdf += `xref\n0 7\n0000000000 65535 f \n`
  for (let i = 1; i <= 6; i++) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(pdf, (character) => character.charCodeAt(0)).buffer
}

describe('PDF to SVG', () => {
  test('detects PDF and PDF-compatible Illustrator input as supported', () => {
    const bytes = onePagePdf()
    expect(detect(bytes, 'artwork.pdf')).toMatchObject({ format: 'pdf', supported: true })
    expect(detect(bytes, 'artwork.ai')).toMatchObject({ format: 'ai', supported: true })
  })

  test('exports the first PDF page as true SVG geometry', async () => {
    const result = await pdfToSvg(onePagePdf())
    expect(result.meta).toMatchObject({
      width: 100,
      height: 60,
      pages: 1,
      page: 1,
      summary: '1 page',
    })
    expect(result.warnings).toEqual([])
    expect(result.svg).toContain('<svg')
    expect(result.svg).toContain('viewBox="0 0 100 60"')
    expect(result.svg).toMatch(/<(path|rect)\b/)
  })

  test('exports a selected page with its own dimensions', async () => {
    const result = await pdfToSvg(twoPagePdf(), 1)
    expect(result.meta).toMatchObject({
      width: 80,
      height: 120,
      pages: 2,
      page: 2,
      summary: 'page 2 of 2',
    })
    expect(result.warnings).toEqual([])
    expect(result.svg).toContain('viewBox="0 0 80 120"')
    expect(result.svg).toMatch(/<(path|rect)\b/)
  })

  test('rejects a page outside the document', async () => {
    expect(pdfToSvg(twoPagePdf(), 2)).rejects.toThrow(
      'Page 3 is outside this 2-page document.',
    )
  })
})
