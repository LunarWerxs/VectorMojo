// Format detection by magic bytes (never trust the file extension alone).

export type Format = 'psd' | 'pdf' | 'ai' | 'eps' | 'svg' | 'png' | 'jpg' | 'unknown'

export interface Detected {
  format: Format
  label: string
  /** Can v1 convert this to SVG right now? */
  supported: boolean
  note?: string
}

const ascii = (buf: Uint8Array, start: number, len: number) => {
  let s = ''
  for (let i = start; i < start + len && i < buf.length; i++) s += String.fromCharCode(buf[i])
  return s
}

export function detect(bytes: ArrayBuffer, filename = ''): Detected {
  const b = new Uint8Array(bytes)
  const ext = filename.toLowerCase().split('.').pop() ?? ''

  // PSD / PSB: "8BPS"
  if (ascii(b, 0, 4) === '8BPS')
    return { format: 'psd', label: 'Photoshop (PSD/PSB)', supported: true }

  // PDF: "%PDF" -- but a modern (PDF-compatible) Illustrator file is also a
  // %PDF stream, so check the extension first to keep the AI-specific label.
  if (ascii(b, 0, 4) === '%PDF') {
    if (ext === 'ai')
      return {
        format: 'ai',
        label: 'Illustrator (AI)',
        supported: true,
      }
    return {
      format: 'pdf',
      label: 'PDF',
      supported: true,
    }
  }

  // EPS: "%!PS" or the EPS binary header C5 D0 D3 C6
  if (ascii(b, 0, 4) === '%!PS' || (b[0] === 0xc5 && b[1] === 0xd0 && b[2] === 0xd3 && b[3] === 0xc6))
    return {
      format: 'eps',
      label: 'EPS / PostScript',
      supported: true,
    }

  // Illustrator: modern .ai is a PDF; some start with the AI PGF prologue.
  if (ext === 'ai')
    return {
      format: 'ai',
      label: 'Illustrator (AI)',
      supported: false,
      note: 'Only modern PDF-compatible Illustrator files are supported.',
    }

  // SVG: look for "<svg" in the first chunk (may follow an XML/BOM preamble).
  // UTF-16 SVGs (BOM FF FE / FE FF) interleave NUL bytes, so decode those
  // properly before searching.
  let head = ascii(b, 0, Math.min(512, b.length)).toLowerCase()
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) {
    const enc = b[0] === 0xff ? 'utf-16le' : 'utf-16be'
    try {
      head = new TextDecoder(enc)
        .decode(b.slice(0, Math.min(1024, b.length)))
        .toLowerCase()
    } catch {
      /* keep byte-wise head */
    }
  }
  if (head.includes('<svg'))
    return {
      format: 'svg',
      label: 'SVG',
      supported: true,
    }

  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return {
      format: 'png',
      label: 'PNG (raster)',
      supported: true,
    }

  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return {
      format: 'jpg',
      label: 'JPEG (raster)',
      supported: true,
    }

  return { format: 'unknown', label: 'Unknown', supported: false }
}
