import { systemFonts } from './system-fonts.mjs?v=75'

export function validFontFamily(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 96 &&
    name.trim() === name && !/[\u0000-\u001f\u007f]/u.test(name)
}

export function registerLocalFont(name) {
  if (!validFontFamily(name)) throw new Error('Invalid font family')
  const ids = [false, true].map(bold => 'system-local-' + (bold ? 'bold:' : 'regular:') + encodeURIComponent(name))
  ids.forEach((id, index) => {
    systemFonts[id] = { name, fallback: 'sans-serif', bold: Boolean(index), local: true }
  })
  return ids
}

export function projectFontFamilies(project) {
  return [...new Set(project.slots.map(slot => systemFonts[slot.font])
    .filter(font => font?.local).map(font => font.name))]
}
