export const vendorId = 0x0416
export const productId = 0x5020

export function encodeReports(project, bitmaps, date = new Date(), brightnessCodes = [0x40, 0x20, 0x10, 0]) {
  const header = new Uint8Array(64)
  header.set([0x77, 0x61, 0x6e, 0x67])
  header[5] = brightnessCodes[project.brightness]
  const lengths = new DataView(header.buffer)
  let total = 0

  bitmaps.forEach((bitmap, index) => {
    const { speed, mode, blink, border } = project.slots[index]
    const blocks = Math.ceil(bitmap.width / 8)
    total += blocks * project.height
    lengths.setUint16(16 + 2 * index, blocks)
    header[8 + index] = ((speed - 1) << 4) | mode
    if (blink) header[6] |= 1 << index
    if (border) header[7] |= 1 << index
  })
  if (!total) throw new Error('Vul minstens één bericht in.')
  if (total + 64 > 8192) throw new Error('De berichten passen samen niet in het badgegeheugen.')
  header.set([date.getFullYear() % 100, date.getMonth() + 1, date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds()], 38)

  const payload = new Uint8Array(Math.ceil(total / 64) * 64)
  let offset = 0
  for (const { width, pixels } of bitmaps) {
    for (let block = 0; block < width; block += 8) {
      for (let y = 0; y < project.height; y++) {
        let row = 0
        for (let bit = 0; bit < 8 && block + bit < width; bit++) {
          if (pixels[y * width + block + bit]) row |= 0x80 >> bit
        }
        payload[offset++] = row
      }
    }
  }
  const reports = [header]
  for (let index = 0; index < payload.length; index += 64) {
    reports.push(payload.subarray(index, index + 64))
  }
  return reports
}
