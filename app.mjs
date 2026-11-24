import { validFontFamily, registerLocalFont, projectFontFamilies } from './local-fonts.mjs?v=75'
import { rasterizeBitmapText, unsupportedBitmapCharacters } from './bitmap-text.mjs?v=75'
import { systemFonts, systemBitmapMatches, rasterizeSystemText, systemFontAvailable } from './system-fonts.mjs?v=75'
import { identifyBadge, supportsProject, usbFilters } from './badge-profiles.mjs?v=75'
import { translations } from './locale.mjs?v=75'
import { fonts } from './fonts.mjs?v=75'
import { encodeReports } from './protocol.mjs?v=75'

const byId = id => document.getElementById(id)
function preference(key, options, fallback) {
  try {
    const value = localStorage.getItem('badge-' + key)
    if (options.includes(value)) return value
  } catch {}
  return fallback
}

let language = preference('language', ['nl', 'en', 'de'], 'nl')
let theme = preference('theme', ['light', 'auto', 'dark'], 'dark')
const systemTheme = matchMedia('(prefers-color-scheme: dark)')
function t(key, params = {}) {
  const translated = translations[key]?.[{ en: 0, de: 1 }[language]] ?? key
  return translated.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match)
}
const localFontPreference = 'badge-local-font-families-v1'
try {
  const names = JSON.parse(localStorage.getItem(localFontPreference) || '[]')
  if (Array.isArray(names)) names.slice(0, 40).filter(validFontFamily).forEach(registerLocalFont)
} catch {}
const systemGroup = document.createElement('optgroup')
systemGroup.label = 'Systeemlettertypes'
for (const [key, font] of Object.entries(systemFonts)) {
  if (font.local) continue
  systemGroup.append(new Option(font.name + (font.bold ? ' Bold' : ''), key))
}
byId('font').append(systemGroup)
const localGroup = document.createElement('optgroup')
byId('font').append(localGroup)
function refreshLocalFonts() {
  const selectedFont = byId('font').value
  localGroup.label = t('Eigen lettertypes')
  localGroup.replaceChildren(...Object.entries(systemFonts).filter(([, font]) => font.local)
    .map(([id, font]) => new Option(font.name + (font.bold ? ' Bold' : ''), id)))
  localGroup.hidden = !localGroup.children.length
  if (selectedFont) byId('font').value = selectedFont
}
refreshLocalFonts()

const textNodes = [...document.querySelectorAll('[data-i18n]')].map(node => [node, node.textContent])
const attributes = ['aria-label', 'placeholder'].flatMap(attribute =>
  [...document.querySelectorAll('[data-i18n-' + attribute + ']')]
    .map(node => [node, attribute, node.getAttribute(attribute)]))

const displayPalettes = {
  dark: { background: '#111312', off: '#37372e', previewOff: '#2b2b24',
    on: '#ffa750', cursor: '#ffffff', brightness: ['#985226', '#bd642a', '#e58132', '#ffa750'],
    rgbOn: [255, 167, 80], rgbOff: [30, 30, 30] },
  light: { background: '#f0ece3', off: '#d7d0c2', previewOff: '#ded7ca',
    on: '#b95008', cursor: '#4d3823', brightness: ['#d5a684', '#ca8756', '#c16b2d', '#b95008'],
    rgbOn: [185, 80, 8], rgbOff: [240, 236, 227] }
}
let displayPalette = displayPalettes.dark

function applyTheme() {
  const dark = theme === 'dark' || (theme === 'auto' && systemTheme.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  displayPalette = dark ? displayPalettes.dark : displayPalettes.light
  document.querySelector('meta[name="theme-color"]').content = dark ? '#171919' : '#f7f4ee'
  drawPixels()
  if (!byId('image-preview').hidden) renderImportedImage()
}

let pendingConfirmation
async function confirmAction(message) {
  if (pendingConfirmation) return false
  const dialog = byId('confirmation')
  byId('confirmation-message').textContent = message
  byId('confirmation-cancel').textContent = t('Annuleren')
  byId('confirmation-accept').textContent = t('Doorgaan')
  dialog.showModal()
  byId('confirmation-cancel').focus()
  return new Promise(resolve => {
    pendingConfirmation = resolve
  })
}
function finishConfirmation(accepted) {
  const resolve = pendingConfirmation
  pendingConfirmation = undefined
  byId('confirmation').close()
  resolve?.(accepted)
}
byId('confirmation-cancel').onclick = () => finishConfirmation(false)
byId('confirmation-accept').onclick = () => finishConfirmation(true)
byId('confirmation').oncancel = event => {
  event.preventDefault()
  finishConfirmation(false)
}

const controls = Object.fromEntries(['message', 'font', 'pixels', 'reset-pixels', 'mode', 'speed', 'brightness', 'size', 'blink', 'border',
  'preview', 'slots', 'connect', 'send', 'export', 'import', 'file', 'status'].map(id => [id, byId(id)]))
const icons = {
  heart: ['0000000', '0110110', '1111111', '1111111', '0111110', '0011100', '0001000'],
  star: ['0001000', '0001000', '1111111', '0111110', '0011100', '0110110', '0100010'],
  smile: ['0000000', '0100010', '0100010', '0000000', '1000001', '0100010', '0011100'],
  sad: ['0000000', '0100010', '0100010', '0000000', '0011100', '0100010', '1000001'],
  angry: ['1000001', '0100010', '0010100', '0000000', '0100010', '0000000', '0111110'],
  upside: ['0011100', '0100010', '1000001', '0000000', '0100010', '0100010', '0000000'],
  arrow: ['0001000', '0001100', '0000110', '1111111', '0000110', '0001100', '0001000'],
  check: ['0000000', '0000001', '0000011', '1000110', '1101100', '0111000', '0010000']
}
// Small grids need their own silhouettes to retain the defining details.
const smallIcons = {
  star: {
    5: ['00100', '11111', '01110', '01110', '01010'],
    6: ['001100', '001100', '111111', '011110', '011110', '010010']
  },
  smile: {
    5: ['01010', '01010', '00000', '10001', '01110'],
    6: ['000000', '010010', '000000', '100001', '100001', '011110']
  },
  sad: {
    5: ['01010', '01010', '00000', '01110', '10001'],
    6: ['000000', '010010', '000000', '011110', '100001', '100001']
  },
  angry: {
    5: ['10001', '01010', '00000', '01010', '11111'],
    6: ['100001', '010010', '000000', '010010', '000000', '011110']
  },
  upside: {
    5: ['01110', '10001', '00000', '01010', '01010'],
    6: ['011110', '100001', '100001', '000000', '010010', '000000']
  },
  arrow: {
    5: ['00100', '00010', '11111', '00010', '00100'],
    6: ['001000', '000110', '111111', '111111', '000110', '001000']
  },
  check: {
    5: ['00001', '00010', '10100', '01000', '00000'],
    6: ['000001', '000010', '100100', '101000', '010000', '000000']
  }
}
const heartSizes = {
  '5': [
    '11011',
    '11111',
    '01110',
    '00100',
    '00100'
  ],
  '6': [
    '110011',
    '111111',
    '111111',
    '011110',
    '001100',
    '001100'
  ],
  '7': [
    '1110111',
    '1111111',
    '1111111',
    '0111110',
    '0011100',
    '0001000',
    '0001000'
  ],
  '8': [
    '11100111',
    '11111111',
    '11111111',
    '11111111',
    '01111110',
    '00111100',
    '00011000',
    '00011000'
  ],
  '9': [
    '111101111',
    '111111111',
    '111111111',
    '111111111',
    '011111110',
    '001111100',
    '000111000',
    '000010000',
    '000010000'
  ],
  '10': [
    '1111001111',
    '1111111111',
    '1111111111',
    '1111111111',
    '1111111111',
    '0111111110',
    '0011111100',
    '0001111000',
    '0000110000',
    '0000110000'
  ],
  '11': [
    '11111011111',
    '11111111111',
    '11111111111',
    '11111111111',
    '11111111111',
    '01111111110',
    '00111111100',
    '00011111000',
    '00001110000',
    '00000100000',
    '00000100000'
  ],
  '12': [
    '111110011111',
    '111111111111',
    '111111111111',
    '111111111111',
    '111111111111',
    '111111111111',
    '011111111110',
    '001111111100',
    '000111111000',
    '000011110000',
    '000001100000',
    '000001100000'
  ]
}
const iconControls = Object.fromEntries(['icon-kind', 'add-icon', 'icon-target', 'icon-size', 'icon-direction', 'icon-expression', 'remove-icon']
  .map(id => [id, byId(id)]))

const expressions = ['smile', 'sad', 'angry', 'upside']

let storageKey = 'led-badge-studio-v1'
let editorMode = 'regular'
const fresh = () => ({
  version: 1, height: 11, brightness: 3,
  slots: Array.from({ length: 8 }, () => ({ text: '', font: '5x7', speed: 5, mode: 0, blink: false, border: false }))
})

const previousFonts = { legacy: '5x7', pixel: '5x7', block: '5x8', compact: '4x6',
  tall: '6x9', spaced: '6x10', mini: '4x6', rounded: '5x7', slanted: '5x7' }

function validate(data) {
  if (data?.localFonts !== undefined) {
    if (!Array.isArray(data.localFonts) || data.localFonts.length > 40 || !data.localFonts.every(validFontFamily))
      throw new Error(t('Dit bestand bevat geen geldig Badge Studio-project.'))
    data.localFonts.forEach(registerLocalFont)
  }
  const valid = data?.version === 1 && [11, 12].includes(data.height) &&
    [0, 1, 2, 3].includes(data.brightness) && Array.isArray(data.slots) && data.slots.length === 8 &&
    data.slots.every(slot => typeof slot?.text === 'string' && slot.text.length <= 480 &&
      (slot.icons === undefined || (Array.isArray(slot.icons) && slot.icons.length <= 32 &&
        slot.icons.every(icon => icon && Object.hasOwn(icons, icon.kind) &&
          (icon.turn === undefined || Number.isInteger(icon.turn) && icon.turn >= 0 && icon.turn < 8) &&
          Number.isInteger(icon.size) && icon.size >= 5 && icon.size <= 12 &&
          Number.isInteger(icon.x) && icon.x >= 0 && icon.x < 5000 &&
          Number.isInteger(icon.y) && icon.y >= 0 && icon.y < 12))) &&
      (slot.transform === undefined || (Number.isInteger(slot.transform.x) && Math.abs(slot.transform.x) <= 5000 &&
        Number.isInteger(slot.transform.y) && Math.abs(slot.transform.y) <= 12 && typeof slot.transform.mirror === 'boolean')) &&
      (slot.raster === undefined || (Number.isInteger(slot.raster.width) && slot.raster.width > 0 &&
        slot.raster.width <= 5000 && Array.isArray(slot.raster.pixels) &&
        slot.raster.pixels.length === slot.raster.width * 12 &&
        slot.raster.pixels.every(pixel => pixel === 0 || pixel === 1))) &&
      (slot.textSize === undefined || Number.isInteger(slot.textSize) && (slot.textSize === 0 || slot.textSize >= 4 && slot.textSize <= 12)) &&
      (slot.textThreshold === undefined || Number.isInteger(slot.textThreshold) && slot.textThreshold >= 20 && slot.textThreshold <= 65) &&
      (slot.include === undefined || typeof slot.include === 'boolean') &&
      (slot.font === undefined || Object.hasOwn(fonts, slot.font) || Object.hasOwn(systemFonts, slot.font) || Object.hasOwn(previousFonts, slot.font)) &&
      (slot.edits === undefined || (Array.isArray(slot.edits) && slot.edits.length <= 50000 &&
        slot.edits.every(edit => Number.isInteger(edit) && edit >= 0 && edit < 60000))) &&
      Number.isInteger(slot.speed) && slot.speed >= 1 && slot.speed <= 8 &&
      [0, 1, 2, 3, 4, 6, 7, 8, 9].includes(slot.mode) && typeof slot.blink === 'boolean' && typeof slot.border === 'boolean')
  if (!valid) throw new Error(t('Dit bestand bevat geen geldig Badge Studio-project.'))
  for (const slot of data.slots) {
    if (slot.textThreshold > 40) {
      slot.textThreshold = 40
      delete slot.systemBitmap
    }
    delete slot.borderStyle
    if (slot.mode === 9) slot.mode = 4
    if (!Object.hasOwn(fonts, slot.font) && !Object.hasOwn(systemFonts, slot.font)) {
      slot.font = previousFonts[slot.font] ?? '5x7'
      delete slot.edits
    }
  }
  return data
}

let project = fresh()
try {
  const saved = localStorage.getItem(storageKey)
  if (saved) project = validate(JSON.parse(saved))
} catch {
  controls.status.textContent = 'Het lokale project kon niet worden geladen.'
}

let history = [JSON.stringify(project)]
let historyIndex = 0
const slotFields = []
let selected = 0
let device
let badgeProfile
let busy = false
let bitmap
let started
let activeIcon = -1
let drag
let cursorX = 0
let cursorY = 0
const preview = controls.preview.getContext('2d')
let currentStatus = [controls.status.textContent]
function status(key, params) {
  currentStatus = [key, params]
  controls.status.textContent = t(...currentStatus)
}
function applyLanguage() {
  document.documentElement.lang = language
  systemGroup.label = t('Systeemlettertypes')
  refreshLocalFonts()
  for (const [node, key] of textNodes) node.textContent = t(key)
  for (const [node, attribute, key] of attributes) node.setAttribute(attribute, t(key))
  updateLabels()
  syncIcons()
  updateButtons()
  status(...currentStatus)
  byId('cycle').textContent = t(cycleTimer ? 'Cyclus stoppen' : 'Cyclus starten')
  updatePreview()
}

function iconBounds(icon) {
  const size = Math.min(icon.size, project.height)
  return { x: icon.x, y: Math.min(icon.y, project.height - size), size }
}

function messageBitmap(slot) {
  let base
  if (Object.hasOwn(systemFonts, slot.font)) {
    if (!systemBitmapMatches(slot.systemBitmap, slot, project.height)) {
      slot.systemBitmap = rasterizeSystemText(slot, project.height)
    }
    base = slot.systemBitmap
  } else {
    base = rasterizeBitmapText(slot.font, slot.text, project.height)
  }
  if (slot.raster) {
    const pixels = new Uint8Array(slot.raster.width * project.height)
    for (let y = 0; y < project.height; y++) {
      pixels.set(slot.raster.pixels.slice(y * slot.raster.width, (y + 1) * slot.raster.width), y * slot.raster.width)
    }
    base = { width: slot.raster.width, pixels }
  }
  const width = Math.max(base.width, project.height === 11 ? 44 : 48,
    ...(slot.icons ?? []).map(icon => icon.x + iconBounds(icon).size))
  const pixels = new Uint8Array(width * project.height)
  const origin = slot.mode >= 2 ? Math.max(0, Math.floor((width - base.width) / 2)) : 0
  for (let y = 0; y < project.height; y++) {
    pixels.set(base.pixels.slice(y * base.width, (y + 1) * base.width), y * width + origin)
  }
  for (const icon of slot.icons ?? []) {
    const { x, y, size } = iconBounds(icon)
    const shape = icon.kind === 'heart' ? heartSizes[size] : smallIcons[icon.kind]?.[size] ?? icons[icon.kind]
    const direction = icon.kind === 'arrow' ? icon.turn ?? 0 : 0
    const diagonal = direction >= 4
    const turns = direction % 4
    const head = Math.ceil(size / 2)
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        let sy = row
        let sx = col
        for (let turn = 0; turn < turns; turn++) {
          [sy, sx] = [size - 1 - sx, sy]
        }
        const source = shape[Math.floor((sy + .5) * shape.length / size)]
        // The diagonal template points up-right and uses whole pixels at every size.
        const lit = diagonal
          ? sx + sy === size - 1 || (sy === 0 && sx >= size - head) || (sx === size - 1 && sy < head)
          : source[Math.floor((sx + .5) * source.length / size)] === '1'
        if (lit) {
          pixels[(y + row) * width + x + col] = 1
        }
      }
    }
  }
  for (const edit of slot.edits ?? []) {
    const x = Math.floor(edit / 12)
    const y = edit % 12
    if (x < width && y < project.height) pixels[y * width + x] ^= 1
  }
  if (slot.transform) {
    const output = new Uint8Array(pixels.length)
    const { x: dx, y: dy, mirror } = slot.transform
    for (let y = 0; y < project.height; y++) for (let x = 0; x < width; x++) {
      const nx = (mirror ? width - 1 - x : x) + dx
      const ny = y + dy
      if (nx >= 0 && nx < width && ny >= 0 && ny < project.height) output[ny * width + nx] = pixels[y * width + x]
    }
    return { width, pixels: output }
  }
  return { width, pixels }
}

function sourcePoint(x, y) {
  const transform = project.slots[selected].transform
  if (!transform) return [x, y]
  x -= transform.x
  return [transform.mirror ? bitmap.width - 1 - x : x, y - transform.y]
}

function drawPixels() {
  const canvas = controls.pixels
  canvas.parentElement.style.setProperty("--grid-width", bitmap.width * 12 + "px")
  canvas.style.setProperty("--grid-min-width", bitmap.width * 8 + "px")
  canvas.width = bitmap.width * 12
  canvas.height = project.height * 12
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = displayPalette.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < project.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      ctx.fillStyle = bitmap.pixels[y * bitmap.width + x] ? displayPalette.on : displayPalette.off
      ctx.fillRect(x * 12 + 2, y * 12 + 2, 8, 8)
    }
  }
  const icon = project.slots[selected].icons?.[activeIcon]
  if (icon) {
    const { x, y, size } = iconBounds(icon)
    ctx.strokeStyle = displayPalette.cursor
    const transform = project.slots[selected].transform
    const left = (transform?.mirror ? bitmap.width - x - size : x) + (transform?.x ?? 0)
    ctx.strokeRect(left * 12 + .5, (y + (transform?.y ?? 0)) * 12 + .5, size * 12 - 1, size * 12 - 1)
  }
  if (document.activeElement === canvas && !icon) {
    ctx.strokeStyle = displayPalette.cursor
    const transform = project.slots[selected].transform
    const x = (transform?.mirror ? bitmap.width - 1 - cursorX : cursorX) + (transform?.x ?? 0)
    ctx.strokeRect(x * 12 + .5, (cursorY + (transform?.y ?? 0)) * 12 + .5, 11, 11)
  }
}

function togglePixel() {
  const slot = project.slots[selected]
  const edits = new Set(slot.edits)
  const key = cursorX * 12 + cursorY
  if (edits.has(key)) edits.delete(key)
  else edits.add(key)
  slot.edits = [...edits]
  save()
  updatePreview()
  updateButtons()
}

function syncIcons() {
  const list = project.slots[selected].icons ?? []
  iconControls['icon-target'].replaceChildren(new Option(t('Losse leds'), ''))
  list.forEach((icon, index) => {
    const label = expressions.includes(icon.kind)
      ? 'Smiley'
      : [...iconControls['icon-kind'].options].find(option => option.value === icon.kind).text
    iconControls['icon-target'].add(new Option((index + 1) + '. ' + label, index))
  })
  iconControls['icon-target'].value = activeIcon < 0 ? '' : String(activeIcon)
  const icon = list[activeIcon]
  controls.pixels.classList.toggle('moving-icon', Boolean(icon))
  iconControls['icon-size'].max = project.height
  iconControls['icon-size'].value = icon ? iconBounds(icon).size : 7
  iconControls['icon-size'].disabled = !icon
  iconControls['icon-direction'].parentElement.hidden = icon?.kind !== 'arrow'
  iconControls['icon-direction'].value = icon?.turn ?? 0
  const isSmiley = expressions.includes(icon?.kind)
  iconControls['icon-expression'].parentElement.hidden = !isSmiley
  iconControls['icon-expression'].value = isSmiley ? icon.kind : 'smile'
  iconControls['remove-icon'].disabled = !icon
  iconControls['add-icon'].disabled = list.length >= 32
}

function updateIcons() {
  syncIcons()
  updatePreview()
  updateButtons()
  save()
}

iconControls['add-icon'].onclick = () => {
  const slot = project.slots[selected]
  const list = slot.icons ??= []
  if (list.length >= 32) return
  const size = 7
  const viewport = controls.pixels.parentElement
  const x = Math.floor(viewport.scrollLeft * bitmap.width / controls.pixels.getBoundingClientRect().width)
  list.push({ kind: iconControls['icon-kind'].value, x, y: Math.floor((project.height - size) / 2), size })
  activeIcon = list.length - 1
  updateIcons()
  byId('tool-icons').close()
}
iconControls['icon-target'].onchange = event => {
  activeIcon = event.target.value === '' ? -1 : Number(event.target.value)
  syncIcons()
  drawPixels()
}
iconControls['icon-size'].onchange = event => {
  const icon = project.slots[selected].icons?.[activeIcon]
  if (!icon) return
  const value = event.target.valueAsNumber
  if (Number.isFinite(value)) {
    icon.size = Math.max(5, Math.min(project.height, Math.round(value)))
    icon.y = Math.min(icon.y, project.height - icon.size)
  }
  updateIcons()
}
iconControls['icon-direction'].onchange = event => {
  const icon = project.slots[selected].icons?.[activeIcon]
  if (icon?.kind !== 'arrow') return
  icon.turn = Number(event.target.value)
  updateIcons()
}
iconControls['icon-expression'].onchange = event => {
  const icon = project.slots[selected].icons?.[activeIcon]
  if (!expressions.includes(icon?.kind) || !expressions.includes(event.target.value)) return
  icon.kind = event.target.value
  updateIcons()
}
iconControls['remove-icon'].onclick = () => {
  if (activeIcon < 0) return
  project.slots[selected].icons.splice(activeIcon, 1)
  activeIcon = -1
  updateIcons()
}

function gridPoint(event) {
  const rect = controls.pixels.getBoundingClientRect()
  return sourcePoint(Math.floor((event.clientX - rect.left) * bitmap.width / rect.width),
    Math.floor((event.clientY - rect.top) * project.height / rect.height))
}

controls.pixels.onpointerdown = event => {
  const icon = project.slots[selected].icons?.[activeIcon]
  if (!icon || event.button !== 0) return
  const [x, y] = gridPoint(event)
  const bounds = iconBounds(icon)
  if (x < bounds.x || x >= bounds.x + bounds.size || y < bounds.y || y >= bounds.y + bounds.size) return
  drag = { id: event.pointerId, icon, dx: x - bounds.x, dy: y - bounds.y, width: bitmap.width }
  controls.pixels.setPointerCapture(event.pointerId)
}
controls.pixels.onpointermove = event => {
  if (drag?.id !== event.pointerId) return
  const [x, y] = gridPoint(event)
  const size = iconBounds(drag.icon).size
  drag.icon.x = Math.max(0, Math.min(drag.width - size, x - drag.dx))
  drag.icon.y = Math.max(0, Math.min(project.height - size, y - drag.dy))
  updatePreview()
}
controls.pixels.onlostpointercapture = event => {
  if (drag?.id !== event.pointerId) return
  drag = undefined
  save()
}
controls.pixels.onclick = event => {
  if (activeIcon >= 0) return
  const [x, y] = gridPoint(event)
  cursorX = Math.min(bitmap.width - 1, Math.max(0, x))
  cursorY = Math.min(project.height - 1, Math.max(0, y))
  togglePixel()
}
controls.pixels.onfocus = controls.pixels.onblur = drawPixels
controls.pixels.onkeydown = event => {
  const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  if (activeIcon >= 0) return
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    togglePixel()
  } else if (Object.hasOwn(movement, event.key)) {
    event.preventDefault()
    const [x, y] = movement[event.key]
    cursorX = Math.min(bitmap.width - 1, Math.max(0, cursorX + x))
    cursorY = Math.min(project.height - 1, Math.max(0, cursorY + y))
    const viewport = controls.pixels.parentElement
    const pitch = controls.pixels.getBoundingClientRect().width / bitmap.width
    if (cursorX * pitch < viewport.scrollLeft) viewport.scrollLeft = cursorX * pitch
    if ((cursorX + 1) * pitch > viewport.scrollLeft + viewport.clientWidth) {
      viewport.scrollLeft = (cursorX + 1) * pitch - viewport.clientWidth
    }
    drawPixels()
  }
}
byId('clear-message').onclick = async () => {
  const slot = project.slots[selected]
  if (!await confirmAction(t('Tekst, iconen en led-aanpassingen van bericht {n} wissen?', { n: selected + 1 }))) return
  slot.text = ''
  delete slot.transform
  delete slot.icons
  delete slot.raster
  delete slot.edits
  save()
  sync()
}

controls['reset-pixels'].onclick = () => {
  delete project.slots[selected].edits
  save()
  updatePreview()
  updateButtons()
}

function updatePreview() {
  const isSystem = Object.hasOwn(systemFonts, project.slots[selected].font)
  const unsupported = isSystem ? [] : unsupportedBitmapCharacters(project.slots[selected].font, project.slots[selected].text)
  byId('font-warning').hidden = !unsupported.length
  byId('font-warning').textContent = unsupported.length ? t('Dit lettertype mist: {chars}. Deze tekens verschijnen als ?.', { chars: unsupported.join(' ') }) : ''
  byId('system-font-note').hidden = !isSystem
  byId('system-font-availability').hidden = !isSystem
  byId('text-settings-button').hidden = !isSystem
  bitmap = messageBitmap(project.slots[selected])
  if (isSystem) {
    const slot = project.slots[selected]
    byId('system-font-availability').textContent = systemFontAvailable(slot.font)
      ? t('{font} is beschikbaar op deze computer.', { font: systemFonts[slot.font].name })
      : t('{font} is niet beschikbaar. Je ziet een vervangend lettertype.', { font: systemFonts[slot.font].name })
    const size = slot.systemBitmap.effectiveSize ?? (slot.systemBitmap.size || project.height)
    byId('text-size-info').textContent = t('Rendergrootte: {size} px', { size })
    byId('text-settings-button').textContent = t('Tekstinstellingen · {size} px', { size })
  }
  cursorX = Math.min(cursorX, bitmap.width - 1)
  cursorY = Math.min(cursorY, project.height - 1)
  drawPixels()
  const columns = project.height === 11 ? 44 : 48
  controls.preview.width = columns * 12
  controls.preview.height = project.height * 12
  started = performance.now()
}

let cycleTimer
function draw(now) {
  const columns = controls.preview.width / 12
  const { speed, mode, blink, border } = project.slots[selected]
  const elapsed = now - started
  const visible = !blink || Math.floor(elapsed / 450) % 2 === 0
  const step = Math.floor(elapsed * (4 + speed * 4) / 1000)
  const cycle = bitmap.width + columns
  let origin = Math.max(0, Math.floor((columns - bitmap.width) / 2))
  if (mode === 0) origin = columns - step % cycle
  if (mode === 1) origin = step % cycle - bitmap.width
  let vertical = 0
  if (mode === 2) vertical = project.height - step % (2 * project.height)
  if (mode === 3) vertical = step % (2 * project.height) - project.height
  const phase = step % (columns + 16)
  preview.fillStyle = displayPalette.background
  preview.fillRect(0, 0, controls.preview.width, controls.preview.height)

  for (let y = 0; y < project.height; y++) {
    for (let x = 0; x < columns; x++) {
      const source = x - origin
      const row = y - vertical
      const revealed = (mode !== 6 || y <= phase) &&
        (mode !== 7 || Math.abs(x - (columns - 1) / 2) <= phase) &&
        (mode !== 8 || x <= phase)
      const lit = visible && revealed && row >= 0 && row < project.height &&
        source >= 0 && source < bitmap.width && bitmap.pixels[row * bitmap.width + source]
      const edge = border && ((y === 0 && (x + step) % 4 === 0) ||
        (y === project.height - 1 && (x - step) % 4 === 0) ||
        ((x === 0 || x === columns - 1) && (y + step) % 4 === 0))
      preview.fillStyle = lit || edge ? displayPalette.brightness[project.brightness] : displayPalette.previewOff
      preview.beginPath()
      preview.arc(x * 12 + 6, y * 12 + 6, 4, 0, Math.PI * 2)
      preview.fill()
    }
  }
  requestAnimationFrame(draw)
}

function updateLabels() {
  const n = selected + 1
  byId('preview-title').textContent = t('Voorbeeld · Bericht {n}', { n })
  byId('slot-title').textContent = t('Instellingen voor bericht {n}', { n })
  slotFields.forEach(({ button, checkbox }, index) => {
    button.setAttribute('aria-label', t('Bericht {n}', { n: index + 1 }))
    checkbox.setAttribute('aria-label', t('Bericht {n} meesturen', { n: index + 1 }))
  })
}

function sync() {
  refreshLocalFonts()
  activeIcon = -1
  syncIcons()
  const slot = project.slots[selected]
  updateLabels()
  byId('text-size').value = slot.textSize ?? 0
  byId('text-threshold').value = 85 - (slot.textThreshold ?? 38)
  controls.message.value = slot.text
  controls.font.value = slot.font ?? '5x7'
  controls.pixels.parentElement.scrollLeft = 0
  cursorX = cursorY = 0
  controls.mode.value = slot.mode
  controls.speed.value = slot.speed
  controls.brightness.selectedIndex = project.brightness
  controls.size.value = project.height
  controls.blink.checked = slot.blink
  controls.border.checked = slot.border
  updateButtons()
  updatePreview()
}

function outgoingSlots() {
  if (editorMode === 'custom') {
    const slot = project.slots[0]
    return slot.text.trim() || slot.edits?.length || slot.icons?.length || slot.raster ? [0] : []
  }
  return project.slots.flatMap((slot, index) =>
    slot.include !== false && (slot.text.trim() || slot.edits?.length || slot.icons?.length || slot.raster) ? [index] : [])
}

function updateButtons() {
  const outgoing = outgoingSlots()
  slotFields.forEach(({ button, checkbox, item }, index) => {
    button.setAttribute('aria-pressed', index === selected)
    checkbox.checked = project.slots[index].include !== false
    item.classList.toggle('outgoing', outgoing.includes(index))
  })
  controls['reset-pixels'].disabled = !project.slots[selected].edits?.length
  controls.connect.disabled = busy || !navigator.hid
  byId('write-selection').textContent = outgoing.length
    ? t('Geselecteerd voor overdracht: {n}', { n: outgoing.map(index => index + 1).join(', ') })
    : t('Geen ingevulde berichten geselecteerd voor overdracht.')
  const memoryFits = updateMemory()
  updateBadgeSettings()
  controls.send.disabled = !memoryFits || busy || !device?.opened || !outgoing.length ||
    !badgeProfile || !supportsProject(badgeProfile, project, outgoing)
}

function updateBadgeSettings() {
  for (const [control, supported] of [
    [controls.size, badgeProfile?.matrices],
    [controls.mode, badgeProfile?.effects]
  ]) {
    for (const option of control.options) {
      option.hidden = option.disabled = Boolean(supported && !supported.includes(Number(option.value)))
    }
  }
  for (const key of ['brightness', 'blink', 'border']) {
    controls[key].closest('label').hidden = badgeProfile?.[key] === false
  }
  const note = byId('badge-profile')
  note.hidden = !badgeProfile
  if (badgeProfile) {
    const name = device.productName || 'USB HID'
    note.textContent = t('{device} · USB HID. Kies zelf de matrixmaat onder Matrix.', { device: name })
  }
}

function save() {
  project.localFonts = projectFontFamilies(project)
  for (const slot of project.slots) {
    if (Object.hasOwn(systemFonts, slot.font)) {
      if (!systemBitmapMatches(slot.systemBitmap, slot, project.height)) {
        slot.systemBitmap = rasterizeSystemText(slot, project.height)
      }
    } else {
      delete slot.systemBitmap
    }
  }
  const snapshot = JSON.stringify(project)
  if (history[historyIndex] !== snapshot) {
    history.splice(historyIndex + 1)
    history.push(snapshot)
    if (history.length > 80) history.shift()
    historyIndex = history.length - 1
  }
  if (byId('undo')) {
    byId('undo').disabled = historyIndex === 0
    byId('redo').disabled = historyIndex === history.length - 1
  }
  try { localStorage.setItem(storageKey, JSON.stringify(project)) }
  catch { status('Lokaal opslaan is niet gelukt. Exporteer het project om het te bewaren.') }
}

for (let index = 0; index < 8; index++) {
  const button = document.createElement('button')
  button.textContent = String(index + 1)
  button.setAttribute('aria-label', 'Bericht ' + (index + 1))
  button.onclick = () => { selected = index; sync() }
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.setAttribute('aria-label', 'Bericht ' + (index + 1) + ' meesturen')
  checkbox.onchange = () => {
    project.slots[index].include = checkbox.checked
    save()
    updateButtons()
  }
  const item = document.createElement('div')
  item.className = 'slot-choice'
  item.append(button, checkbox)
  controls.slots.append(item)
  slotFields.push({ button, checkbox, item })
  controls.speed.add(new Option(String(index + 1), String(index + 1)))
}

for (const id of ['message', 'font']) {
  controls[id].addEventListener('input', () => {
    const slot = project.slots[selected]
    delete slot.raster
    slot.text = controls.message.value
    slot.font = controls.font.value
    delete slot.edits
    save()
    updatePreview()
    updateButtons()
  })
}

for (const id of ['mode', 'speed', 'brightness', 'size', 'blink', 'border']) {
  controls[id].addEventListener('input', () => {
    Object.assign(project.slots[selected], {
      mode: Number(controls.mode.value), speed: Number(controls.speed.value),
      blink: controls.blink.checked, border: controls.border.checked
    })
    const height = Number(controls.size.value)
    if (height !== project.height || id === 'mode') {
      const edited = height !== project.height ? project.slots : [project.slots[selected]]
      edited.forEach(slot => { delete slot.edits })
    }
    project.height = height
    syncIcons()
    project.brightness = controls.brightness.selectedIndex
    save()
    updateButtons()
    updatePreview()
  })
}

controls.export.onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'led-badge-project.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
controls.import.onclick = () => controls.file.click()
controls.file.onchange = async () => {
  try {
    const [file] = controls.file.files
    if (!file) return
    if (file.size > 4000000) throw new Error(t('Dit projectbestand is te groot.'))
    project = validate(JSON.parse(await file.text()))
    selected = 0
    save()
    sync()
  } catch (error) { status('Project openen mislukt. {error}', { error: error.message }) }
  finally { controls.file.value = '' }
}

controls.connect.onclick = async () => {
  busy = true
  updateButtons()
  try {
    const [candidate] = await navigator.hid.requestDevice({ filters: usbFilters })
    if (!candidate) return
    const profile = identifyBadge(candidate)
    if (!profile) throw new Error(t('Deze USB-interface heeft geen passend uitvoerrapport.'))
    if (!candidate.opened) await candidate.open()
    if (device?.opened && device !== candidate) await device.close()
    device = candidate
    badgeProfile = profile
    status('{device} verbonden. Verbinden verstuurt geen berichten.', { device: device.productName || 'Badge' })
    const connected = device
    let received = 0
    const countReport = () => { received++ }
    connected.addEventListener('inputreport', countReport)
    setTimeout(() => {
      connected.removeEventListener('inputreport', countReport)
      if (device !== connected || !connected.opened || busy) return
      status('{device} verbonden. {count} spontane USB-rapporten ontvangen in 5 seconden. Er is geen leescommando verstuurd.',
        { device: connected.productName || 'Badge', count: received })
    }, 5000)
  } catch (error) { status('Verbinden mislukt. {error}', { error: error.message }) }
  finally { busy = false; updateButtons() }
}
navigator.hid?.addEventListener('disconnect', event => {
  if (event.device !== device) return
  device = undefined
  badgeProfile = undefined
  status('Badge losgekoppeld.')
  updateButtons()
})

controls.send.onclick = async () => {
  const target = device
  const profile = badgeProfile
  if (!target?.opened || !profile || busy) return
  let transferStarted = false
  try {
    const outgoing = outgoingSlots()
    if (!outgoing.length || !supportsProject(profile, project, outgoing)) return
    const plan = transferPlan()
    const bitmaps = project.slots.map((slot, index) => {
      const entry = plan.entries[index]
      if (!entry) return { width: 0, pixels: [] }
      return entry.image
    })
    const transfer = project
    const reports = encodeReports(transfer, bitmaps, undefined, profile.brightnessCodes)
    console.info('Badge transfer ' + JSON.stringify({ product: target.productName, brightness: [25, 50, 75, 100][transfer.brightness], brightnessByte: '0x' + reports[0][5].toString(16).padStart(2, '0'), reportCount: reports.length }))
    const numbers = outgoing.map(index => index + 1).join(', ')
    if (!await confirmAction(t('De badge wordt vervangen door de geselecteerde berichten ({n}). Doorgaan?', { n: numbers }))) return
    busy = true
    updateButtons()
    for (const [index, report] of reports.entries()) {
      status('Versturen… {n} / {total}', { n: index + 1, total: reports.length })
      transferStarted = true
      await target.sendReport(profile.reportId, report)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    status('Alle USB-rapporten verstuurd. Controleer de berichten op de badge.')
  } catch (error) {
    status('Overdracht mislukt. {error}', { error: t(error.message) +
      (transferStarted ? ' ' + t('De badge kan gedeeltelijk zijn bijgewerkt.') : '') })
  } finally { busy = false; updateButtons() }
}

if (!navigator.hid) status('Gebruik Chrome of Edge op localhost of HTTPS voor USB. Bewerken kan ook zonder USB.')
sync()
applyLanguage()
applyTheme()
systemTheme.addEventListener('change', applyTheme)
for (const [key, selector, read, update] of [
  ['language', '[data-lang]', () => language, next => { language = next; applyLanguage() }],
  ['theme', '[data-theme-pref]', () => theme, next => { theme = next; applyTheme() }]
]) {
  const buttons = [...document.querySelectorAll(selector)]
  const attribute = selector.slice(1, -1)
  const syncButtons = () => buttons.forEach(button => {
    button.setAttribute('aria-pressed', button.getAttribute(attribute) === read())
  })
  buttons.forEach(button => {
    button.onclick = () => {
      const value = button.getAttribute(attribute)
      update(value)
      syncButtons()
      try { localStorage.setItem('badge-' + key, value) } catch {}
    }
  })
  syncButtons()
}
requestAnimationFrame(draw)
navigator.serviceWorker?.register('./sw.js').catch(error => console.warn('Offline cache:', error))

const workspace = document.querySelector('.workspace')
const main = workspace.parentElement
const header = main.querySelector('header')
const siteFooter = main.querySelector('.site-footer')
function fitSidebar() {
  const bottomPadding = parseFloat(getComputedStyle(main).paddingBottom)
  const headerStyle = getComputedStyle(header)
  const top = parseFloat(getComputedStyle(main).paddingTop) + header.getBoundingClientRect().height +
    parseFloat(headerStyle.marginBottom)
  const footerHeight = siteFooter.getBoundingClientRect().height + parseFloat(getComputedStyle(siteFooter).marginTop)
  workspace.style.setProperty('--workspace-height',
    Math.max(0, Math.floor(window.innerHeight - top - bottomPadding - footerHeight)) + 'px')
}
const layoutResize = new ResizeObserver(fitSidebar)
layoutResize.observe(header)
layoutResize.observe(siteFooter)
window.addEventListener('resize', fitSidebar)
fitSidebar()

byId('copyright-year').textContent = new Date().getFullYear()

function restoreHistory(direction) {
  const next = historyIndex + direction
  if (next < 0 || next >= history.length) return
  historyIndex = next
  project = validate(JSON.parse(history[next]))
  sync()
  save()
}
byId('undo').onclick = () => restoreHistory(-1)
byId('redo').onclick = () => restoreHistory(1)

function transferPlan() {
  const entries = Array(8).fill(null)
  let used = 64
  for (const index of outgoingSlots()) {
    const slot = project.slots[index]
    const image = messageBitmap(slot)
    const bytes = Math.ceil(image.width / 8) * project.height
    used += bytes
    entries[index] = { image, bytes }
  }
  const wireBytes = 64 + Math.ceil((used - 64) / 64) * 64
  if (wireBytes > 8192) throw new Error(t('Geheugen te klein: {used} / 8192 bytes. Vink minder berichten aan of gebruik minder animaties.', { used: wireBytes }))
  return { entries, used: wireBytes }
}

function updateMemory() {
  try {
    const plan = transferPlan()
    byId('memory').textContent = t('Geheugen · {used} / 8192 bytes', { used: plan.used })
    byId('memory-meter').value = plan.used
    byId('memory-meter').classList.remove('over-capacity')
    return true
  } catch (error) {
    byId('memory').textContent = error.message
    byId('memory-meter').value = 8192
    byId('memory-meter').classList.add('over-capacity')
    return false
  }
}

for (let index = 0; index < 8; index++) byId('destination').add(new Option(index + 1, index))
async function copySlot(move) {
  const target = Number(byId('destination').value)
  if (target === selected) return
  if (!await confirmAction(t('Bericht {n} vervangen?', { n: target + 1 }))) return
  const slot = structuredClone(project.slots[selected])
  if (move) project.slots.splice(target, 0, project.slots.splice(selected, 1)[0])
  else project.slots[target] = slot
  selected = target
  save()
  sync()
  byId('tool-1').close()
}
byId('duplicate').onclick = () => copySlot(false)
byId('move').onclick = () => copySlot(true)

const libraryKey = 'badge-project-library-v1'
let library = {}
try { library = JSON.parse(localStorage.getItem(libraryKey) || '{}') } catch {}
if (!library || Array.isArray(library) || typeof library !== 'object') library = {}
function refreshLibrary() {
  byId('library').replaceChildren(...Object.keys(library).sort().map(name => new Option(name, name)))
}
function saveLibrary() {
  try { localStorage.setItem(libraryKey, JSON.stringify(library)); refreshLibrary() }
  catch { status('Lokaal opslaan is niet gelukt. Exporteer het project om het te bewaren.') }
}
byId('library-save').onclick = async () => {
  const name = byId('project-name').value.trim()
  if (!name) return
  if (Object.hasOwn(library, name) && !await confirmAction(t('Dit opgeslagen project vervangen?'))) return
  Object.defineProperty(library, name, { value: structuredClone(project), configurable: true, enumerable: true, writable: true })
  saveLibrary()
  byId('library').value = name
}
byId('library-open').onclick = async () => {
  const entry = library[byId('library').value]
  if (!entry) return
  if (!await confirmAction(t('Huidig project vervangen door het opgeslagen project?'))) return
  try { project = validate(structuredClone(entry)); selected = 0; save(); sync() }
  catch (error) { status(error.message) }
}
byId('library-delete').onclick = async () => {
  const name = byId('library').value
  if (!name || !await confirmAction(t('Opgeslagen project {name} verwijderen?', { name }))) return
  delete library[name]
  saveLibrary()
}
refreshLibrary()

function storeRaster(image) {
  const slot = project.slots[selected]
  const pixels = Array(image.width * 12).fill(0)
  pixels.splice(0, image.pixels.length, ...Array.from(image.pixels))
  delete slot.transform
  slot.raster = { width: image.width, pixels }
  slot.text = ''
  delete slot.transform
  delete slot.icons
  delete slot.edits
  activeIcon = -1
  save()
  sync()
}
function transformPixels(kind, dx = 0, dy = 0) {
  const image = messageBitmap(project.slots[selected])
  const lit = []
  for (let y = 0; y < project.height; y++) for (let x = 0; x < image.width; x++) {
    if (image.pixels[y * image.width + x]) lit.push([x, y])
  }
  if (['left', 'center', 'right'].includes(kind) && lit.length) {
    const min = Math.min(...lit.map(([x]) => x))
    const max = Math.max(...lit.map(([x]) => x))
    const start = kind === 'left' ? 0 : kind === 'right' ? image.width - (max - min + 1) :
      Math.floor((image.width - (max - min + 1)) / 2)
    dx = start - min
  }
  if (['top', 'middle', 'bottom'].includes(kind) && lit.length) {
    const min = Math.min(...lit.map(([, y]) => y))
    const max = Math.max(...lit.map(([, y]) => y))
    const start = kind === 'top' ? 0 : kind === 'bottom' ? project.height - (max - min + 1) :
      Math.floor((project.height - (max - min + 1)) / 2)
    dy = start - min
  }
  const slot = project.slots[selected]
  const previous = slot.transform ?? { x: 0, y: 0, mirror: false }
  if (kind === 'mirror') {
    slot.transform = { x: -previous.x, y: previous.y, mirror: !previous.mirror }
  } else {
    slot.transform = { ...previous, x: previous.x + dx, y: previous.y + dy }
  }
  save()
  sync()
  byId('tool-3').close()
}
byId('mirror').onclick = () => transformPixels('mirror')
document.querySelectorAll('[data-align]').forEach(button => {
  button.onclick = () => transformPixels(button.dataset.align)
})
document.querySelectorAll('[data-shift]').forEach(button => {
  button.onclick = () => transformPixels('shift', ...button.dataset.shift.split(',').map(Number))
})

let imageSource
let imageGeneration = 0
let importedImage
byId('image-file').onchange = async event => {
  const generation = ++imageGeneration
  byId('image-apply').disabled = true
  const file = event.target.files[0]
  if (!file) return
  if (file.size > 20000000) { status('Afbeelding is te groot (maximaal 20 MB).'); return }
  try {
    const source = await createImageBitmap(file)
    if (generation !== imageGeneration) { source.close(); return }
    imageSource?.close()
    imageSource = source
    renderImportedImage()
  } catch { status('Afbeelding kon niet worden geopend.') }
}
function renderImportedImage() {
  if (!imageSource) return
  const width = project.height === 11 ? 44 : 48
  const height = project.height
  const canvas = byId('image-preview')
  canvas.width = width
  canvas.height = height
  canvas.hidden = false
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, width, height)
  const fit = byId('image-fit').value
  const scale = Math[fit === 'cover' ? 'max' : 'min'](width / imageSource.width, height / imageSource.height)
  ctx.drawImage(imageSource, (width - imageSource.width * scale) / 2,
    (height - imageSource.height * scale) / 2, imageSource.width * scale, imageSource.height * scale)
  const data = ctx.getImageData(0, 0, width, height)
  const threshold = Number(byId('image-threshold').value)
  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    const luminance = .2126 * data.data[i * 4] + .7152 * data.data[i * 4 + 1] + .0722 * data.data[i * 4 + 2]
    pixels[i] = Number((luminance < threshold) !== byId('image-invert').checked)
    data.data.set([...(pixels[i] ? displayPalette.rgbOn : displayPalette.rgbOff), 255], i * 4)
  }
  ctx.putImageData(data, 0, 0)
  importedImage = { width, pixels }
  byId('image-apply').disabled = false
}
for (const id of ['image-fit', 'image-threshold', 'image-invert']) byId(id).oninput = renderImportedImage
controls.size.addEventListener('input', renderImportedImage)
byId('image-apply').onclick = async () => {
  if (importedImage && await confirmAction(t('Huidig bericht vervangen door de afbeelding?'))) {
    storeRaster(importedImage)
    byId('tool-2').close()
  }
}

byId('cycle').onclick = () => {
  if (cycleTimer) {
    clearTimeout(cycleTimer)
    cycleTimer = undefined
    byId('cycle').textContent = t('Cyclus starten')
    return
  }
  const next = () => {
    const outgoing = outgoingSlots()
    if (!outgoing.length) { byId('cycle').onclick(); return }
    selected = outgoing[(outgoing.indexOf(selected) + 1) % outgoing.length]
    sync()
    const slot = project.slots[selected]
    const duration = slot.mode < 2 ? (bitmap.width + controls.preview.width / 12) / (4 + slot.speed * 4) * 1000 : 4000
    cycleTimer = setTimeout(next, Math.max(1500, duration))
  }
  byId('cycle').textContent = t('Cyclus stoppen')
  cycleTimer = setTimeout(next, 0)
}

let painting
const iconPointerDown = controls.pixels.onpointerdown
const iconPointerMove = controls.pixels.onpointermove
const iconPointerEnd = controls.pixels.onlostpointercapture
function paintAt(event) {
  const [x, y] = gridPoint(event)
  if (x < 0 || x >= bitmap.width || y < 0 || y >= project.height) return
  if (painting.last) {
    const [px, py] = painting.last
    const steps = Math.max(Math.abs(x - px), Math.abs(y - py))
    painting.last = undefined
    for (let step = 1; step < steps; step++) {
      paintPixel(Math.round(px + (x - px) * step / steps), Math.round(py + (y - py) * step / steps))
    }
  }
  paintPixel(x, y)
  painting.last = [x, y]
}
function paintPixel(x, y) {
  const key = x * 12 + y
  if (painting.visited.has(key)) return
  painting.visited.add(key)
  const source = messageBitmap({ ...project.slots[selected], transform: undefined })
  const current = source.pixels[y * source.width + x]
  const tool = byId('paint-tool').value
  if ((tool === 'draw' && current) || (tool === 'erase' && !current)) return
  const slot = project.slots[selected]
  const edits = new Set(slot.edits)
  if (edits.has(key)) edits.delete(key)
  else edits.add(key)
  slot.edits = [...edits]
  updatePreview()
}
controls.pixels.onpointerdown = event => {
  if (activeIcon >= 0) { iconPointerDown(event); return }
  if (event.button !== 0) return
  painting = { id: event.pointerId, visited: new Set() }
  controls.pixels.setPointerCapture(event.pointerId)
  paintAt(event)
}
controls.pixels.onpointermove = event => {
  if (painting?.id === event.pointerId) paintAt(event)
  else iconPointerMove(event)
}
controls.pixels.onlostpointercapture = event => {
  if (painting?.id === event.pointerId) {
    painting = undefined
    save()
    updateButtons()
  } else iconPointerEnd(event)
}
controls.pixels.onclick = null
const pixelKeyDown = controls.pixels.onkeydown
controls.pixels.onkeydown = event => {
  const icon = project.slots[selected].icons?.[activeIcon]
  const deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  if (icon && deltas[event.key]) {
    event.preventDefault()
    const [dx, dy] = deltas[event.key]
    icon.x = Math.max(0, Math.min(bitmap.width - iconBounds(icon).size, icon.x + dx))
    icon.y = Math.max(0, Math.min(project.height - iconBounds(icon).size, icon.y + dy))
    updateIcons()
  } else pixelKeyDown(event)
}
save()
updateMemory()

byId('editor-mode').onchange = event => {
  if (busy) { event.target.value = editorMode; return }
  save()
  if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = undefined }
  editorMode = event.target.value
  storageKey = editorMode === 'regular' ? 'led-badge-studio-v1' : 'led-badge-studio-custom-v1'
  project = fresh()
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) project = validate(JSON.parse(saved))
  } catch { status('Het lokale project kon niet worden geladen.') }
  selected = 0
  history = [JSON.stringify(project)]
  historyIndex = 0
  document.querySelector('.message-panel').hidden = editorMode === 'custom'
  byId('custom-note').hidden = editorMode !== 'custom'
  byId('cycle').hidden = editorMode === 'custom'
  document.querySelector('[data-tool=tool-1]').hidden = editorMode === 'custom'
  sync()
  save()
}

document.querySelectorAll('[data-tool]').forEach(button => {
  button.onclick = () => byId(button.dataset.tool).showModal()
})
document.querySelectorAll('[data-close-tool]').forEach(button => {
  button.onclick = () => button.closest('dialog').close()
})

for (const id of ['text-size', 'text-threshold']) {
  byId(id).oninput = () => {
    const slot = project.slots[selected]
    slot.textSize = Number(byId('text-size').value)
    slot.textThreshold = 85 - Number(byId('text-threshold').value)
    delete slot.systemBitmap
    delete slot.edits
    updatePreview()
    updateButtons()
    save()
  }
}

byId('scan-local-fonts').hidden = !('queryLocalFonts' in window)
byId('scan-local-fonts').onclick = async () => {
  const button = byId('scan-local-fonts')
  button.disabled = true
  try {
    const available = await window.queryLocalFonts()
    const families = [...new Set(available.map(font => font.family).filter(validFontFamily))].sort((a,b) => a.localeCompare(b))
    byId('local-font-list').replaceChildren(...families.map(name => new Option(name, name)))
    byId('local-font-status').textContent = t('{n} lettertypes gevonden. Kies of typ een naam.', { n: families.length })
  } catch {
    byId('local-font-status').textContent = t('Geen toegang tot lokale fonts. Je kunt de fontnaam ook zelf invullen.')
  } finally { button.disabled = false }
}
byId('add-local-font').onclick = () => {
  const name = byId('local-font-name').value.trim()
  if (!validFontFamily(name)) {
    byId('local-font-status').textContent = t('Vul een geldige fontnaam in (maximaal 96 tekens).')
    return
  }
  if (Object.values(systemFonts).filter(font => font.local && !font.bold).length >= 40 &&
      !Object.values(systemFonts).some(font => font.local && font.name === name)) {
    byId('local-font-status').textContent = t('Je kunt maximaal 40 eigen lettertypes toevoegen.')
    return
  }
  const ids = registerLocalFont(name)
  const [id] = ids
  if (!systemFontAvailable(id, true)) {
    ids.forEach(key => { delete systemFonts[key] })
    byId('local-font-status').textContent = t('{font} is niet gevonden op deze computer.', { font: name })
    return
  }
  const names = [...new Set(Object.values(systemFonts).filter(font => font.local).map(font => font.name))]
  try { localStorage.setItem(localFontPreference, JSON.stringify(names)) } catch {}
  refreshLocalFonts()
  controls.font.value = id
  controls.font.dispatchEvent(new Event('input', { bubbles: true }))
  byId('tool-local-fonts').close()
}
