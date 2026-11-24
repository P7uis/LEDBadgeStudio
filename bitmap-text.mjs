import { fonts } from './fonts.mjs?v=75'

const visibleGlyph = (font, character) => {
  const rows = font.glyphs[character]
  return rows && (/^\s$/u.test(character) || rows.some(Boolean))
}

const charactersForFont = (font, text) => {
  const segments = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment)
    : Array.from(text)
  return segments.flatMap(segment => visibleGlyph(font, segment) ? [segment] : Array.from(segment.normalize('NFC')))
}

export function unsupportedBitmapCharacters(fontId, text) {
  const font = fonts[fontId ?? '5x7']
  return [...new Set(charactersForFont(font, text).filter(character => !visibleGlyph(font, character)))]
}

export function rasterizeBitmapText(fontId, text, height) {
  const font = fonts[fontId ?? '5x7']
  const letters = text.trim() ? charactersForFont(font, text) : []
  const glyphs = letters.map(character => visibleGlyph(font, character) ? character : '?')
  const advances = glyphs.map(character => font.advances?.[character] ?? font.width)
  const width = advances.reduce((sum, advance) => sum + advance, 0)
  const pixels = new Uint8Array(width * height)
  const top = Math.floor((height - font.height) / 2)
  let offset = 0
  glyphs.forEach((character, index) => {
    for (const [y, row] of font.glyphs[character].entries()) {
      const targetY = top + y
      if (targetY < 0 || targetY >= height) continue
      for (let x = 0; x < advances[index]; x++) pixels[targetY * width + offset + x] = (row >> x) & 1
    }
    offset += advances[index]
  })
  return { width, pixels }
}
