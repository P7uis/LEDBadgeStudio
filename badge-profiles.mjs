import { vendorId, productId } from './protocol.mjs?v=75'

// Both matrix sizes share the same USB ID and use the same report format.
// https://github.com/jnweiger/led-name-badge-ls32#hardware
const ls32 = {
  filter: { vendorId, productId },
  usagePage: 0xff00,
  reportId: 0,
  reportBytes: 64,
  matrices: [11, 12],
  effects: [0, 1, 2, 3, 4, 6, 7, 8],
  brightness: true,
  blink: true,
  border: true
}

const profiles = [ls32]
export const usbFilters = profiles.map(profile => profile.filter)

export function identifyBadge(device) {
  const profile = profiles.find(profile => {
    const { vendorId, productId } = profile.filter
    return device.vendorId === vendorId && device.productId === productId &&
      device.collections.some(collection => collection.usagePage === profile.usagePage &&
        (collection.outputReports ?? []).some(report => report.reportId === profile.reportId &&
          report.items.reduce((bits, item) => bits + item.reportSize * item.reportCount, 0) === profile.reportBytes * 8))
  })
  // CH546 uses a four-level index: 0x40 falls outside 0–3.
  // Verified on CH546 hardware: 0x30 dims below 0x20; 0x40 stayed fully bright.
  // Related report: https://github.com/jnweiger/led-name-badge-ls32/issues/57
  return profile && /^CH546$/i.test(device.productName?.trim() ?? '')
    ? { ...profile, brightnessCodes: [0x30, 0x20, 0x10, 0] }
    : profile
}

export function supportsProject(profile, project, outgoing) {
  return profile.matrices.includes(project.height) && outgoing.every(index => {
    const slot = project.slots[index]
    return profile.effects.includes(slot.mode) && (!slot.blink || profile.blink) &&
      (!slot.border || profile.border)
  }) && (profile.brightness || project.brightness === 3)
}
