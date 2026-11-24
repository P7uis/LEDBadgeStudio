// Browser-installed fonts are rasterized once and saved with each message.
export const systemFonts = Object.fromEntries([
  ['arial', 'Arial', 'sans-serif'],
  ['verdana', 'Verdana', 'sans-serif'],
  ['tahoma', 'Tahoma', 'sans-serif'],
  ['trebuchet', 'Trebuchet MS', 'sans-serif'],
  ['helvetica', 'Helvetica', 'sans-serif'],
  ['times', 'Times New Roman', 'serif'],
  ['georgia', 'Georgia', 'serif'],
  ['courier', 'Courier New', 'monospace'],
  ['consolas', 'Consolas', 'monospace'],
  ['calibri', 'Calibri', 'sans-serif'],
  ['cambria', 'Cambria', 'serif'],
  ['comic', 'Comic Sans MS', 'cursive'],
  ['noteworthy', 'Noteworthy', 'cursive']
].flatMap(([id, name, fallback]) => [false, true].map(bold =>
  ['system-' + id + (bold ? '-bold' : ''), { name, fallback, bold }])))

const officeFont = id => /^system-(consolas|calibri|cambria)(-bold)?$/.test(id)
const rendererVersion = () => 7

export function systemBitmapMatches(bitmap, slot, height) {
  return bitmap?.renderer === rendererVersion(slot.font) && bitmap.font === slot.font && !(bitmap.available !== true && systemFontAvailable(slot.font)) && bitmap.text === slot.text && bitmap.height === height &&
    (bitmap.size ?? 0) === (slot.textSize ?? 0) &&
    (bitmap.threshold ?? 38) === (slot.textThreshold ?? 38) &&
    Number.isInteger(bitmap.width) && bitmap.width >= 0 && bitmap.width <= 16000 &&
    Array.isArray(bitmap.pixels) && bitmap.pixels.length === bitmap.width * height &&
    bitmap.pixels.every(pixel => pixel === 0 || pixel === 1)
}

export function rasterizeSystemText(slot, height) {
  const font = systemFonts[slot.font]
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const text = slot.text.normalize('NFC')
  // Render at 4× resolution, then classify each LED by covered area.
  // A shared ascent/descent sample keeps the baseline stable while typing.
  const scale = 4
  // Auto fit starts above the nominal em size, then fits actual ink bounds.
  // These families otherwise leave usable matrix rows empty.
  let size = slot.textSize || height * (officeFont(slot.font) ? 1.5 : 1)
  const threshold = slot.textThreshold ?? 38
  // Bold outlines need a higher coverage cutoff to keep small counters open.
  // Comic Sans' thin a-stem otherwise disappears at 12 LEDs (a becomes o).
  const coverageThreshold = threshold + (font.bold ? 16 : 0) - (slot.font === 'system-comic' ? 4 : 0)
  const referenceText = 'Hgx'
  const setFont = () => {
    context.font = (font.bold ? '700 ' : '400 ') + (size * scale) + 'px ' + JSON.stringify(font.name) + ', ' + font.fallback
    if ('letterSpacing' in context) context.letterSpacing = '0px'
  }
  setFont()
  let reference = context.measureText(referenceText)
  let metrics = context.measureText(text || 'Ag')
  const ascent = () => Math.max(reference.actualBoundingBoxAscent, metrics.actualBoundingBoxAscent)
  const descent = () => Math.max(reference.actualBoundingBoxDescent, metrics.actualBoundingBoxDescent)
  const inkHeight = (ascent() + descent()) / scale
  if (inkHeight > height) {
    size *= height / inkHeight
    setFont()
    reference = context.measureText(referenceText)
    metrics = context.measureText(text || 'Ag')
  }
  // Reserve complete LED rows for both ascenders and descenders before snapping.
  for (let attempt = 0; attempt < 30 && Math.ceil(ascent() / scale) + Math.ceil(descent() / scale) > height; attempt++) {
    size -= 0.1
    setFont()
    reference = context.measureText(referenceText)
    metrics = context.measureText(text || 'Ag')
  }
  const top = Math.ceil(ascent() / scale)
  const bottom = Math.ceil(descent() / scale)
  const baseline = (top + Math.floor((height - top - bottom) / 2)) * scale
  const segments = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment)
    : Array.from(text)
  const columns = [Array(height).fill(0)]
  const glyphCache = new Map()
  for (const glyph of segments) {
    const cached = glyphCache.get(glyph)
    if (cached) { columns.push(...cached); continue }
    const columnStart = columns.length
    const metric = context.measureText(glyph)
    if (!glyph.trim()) {
      for (let i = 0; i < Math.max(1, Math.round(metric.width / scale)); i++) columns.push(Array(height).fill(0))
      continue
    }
    const bearing = Math.ceil(Math.max(0, metric.actualBoundingBoxLeft) / scale)
    const glyphWidth = Math.ceil(Math.max(metric.width, metric.actualBoundingBoxRight) / scale) + bearing + 2
    canvas.width = glyphWidth * scale
    canvas.height = height * scale
    setFont()
    context.fillStyle = '#fff'
    context.fillText(glyph, (bearing + 1) * scale, baseline)
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
    const glyphColumns = Array.from({length: glyphWidth}, () => Array(height).fill(0))
    // Quantize each connected outline component separately. Small dots and thin
    // rules must survive without thickening the rest of the real font outline.
    const visited = new Uint8Array(canvas.width * canvas.height)
    for (let seed = 0; seed < visited.length; seed++) {
      if (visited[seed] || !rgba[seed * 4 + 3]) continue
      const stack = [seed]
      visited[seed] = 1
      const covered = new Map()
      while (stack.length) {
        const at = stack.pop(), px = at % canvas.width, py = Math.floor(at / canvas.width)
        const led = Math.floor(py / scale) * glyphWidth + Math.floor(px / scale)
        covered.set(led, (covered.get(led) ?? 0) + rgba[at * 4 + 3] / (scale * scale * 255))
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy
          if (nx < 0 || ny < 0 || nx >= canvas.width || ny >= canvas.height) continue
          const neighbor = ny * canvas.width + nx
          if (!visited[neighbor] && rgba[neighbor * 4 + 3]) { visited[neighbor] = 1; stack.push(neighbor) }
        }
      }
      const peak = Math.max(...covered.values())
      const cutoff = Math.min(coverageThreshold / 100, peak * 0.8)
      for (const [led, coverage] of covered) if (coverage >= cutoff) glyphColumns[led % glyphWidth][Math.floor(led / glyphWidth)] = 1
    }
    if (slot.font.startsWith('system-consolas')) {
      // Preserve Consolas' side bearings inside its fixed character cell.
      const cellWidth = Math.ceil(metric.width / scale)
      columns.push(...glyphColumns.slice(1, cellWidth + 1), Array(height).fill(0))
      glyphCache.set(glyph, columns.slice(columnStart))
      continue
    }
    while (glyphColumns.length && !glyphColumns[0].some(Boolean)) glyphColumns.shift()
    while (glyphColumns.length && !glyphColumns.at(-1).some(Boolean)) glyphColumns.pop()
    // Keep actual font outlines, but separate neighboring glyphs by one LED.
    // Monospaced families retain an equal advance for narrow and wide letters.
    const advance = font.fallback === 'monospace'
      ? Math.max(Math.ceil(metric.width / scale) + 1, glyphColumns.length + 1)
      : glyphColumns.length + 1
    columns.push(...glyphColumns)
    for (let i = glyphColumns.length; i < advance; i++) columns.push(Array(height).fill(0))
    glyphCache.set(glyph, columns.slice(columnStart))
  }
  const width = text.trim() ? columns.length : 0
  const pixels = Array.from({length: width * height}, (_, i) => columns[i % width][Math.floor(i / width)])
  return { renderer: rendererVersion(slot.font), available: systemFontAvailable(slot.font), text: slot.text, font: slot.font, width, height, pixels,
    size: slot.textSize ?? 0, threshold, effectiveSize: Math.round(size * 10) / 10 }
}

const availability = new Map()
export function systemFontAvailable(id, refresh = false) {
  if (refresh) availability.delete(id)
  if (!availability.has(id)) {
    const font = systemFonts[id]
    const context = document.createElement('canvas').getContext('2d')
    const measure = fallback => {
      context.font = `${font.bold ? 700 : 400} 32px ${JSON.stringify(font.name)}, ${fallback}`
      return context.measureText('Wim013@#').width
    }
    availability.set(id, measure('monospace') === measure('serif'))
  }
  return availability.get(id)
}
