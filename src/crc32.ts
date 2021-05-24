import { makeUint8Array, parseWasm } from "./utils.ts"

const head = "AGFzbQEAAAAB"
const test = "BQFgAAF7AwIBAAoKAQgAQQD9D/1iCw"
const defBasic = "CwJgAABgA39/fwF8AwMCAAEFAwEAAgcNAwFtAgABdAAAAWMAAQqWAQI"
const defSIMD = "EQNgAABgA39/fwF8YAJ/fwF8AwUEAAEAAgUDAQACBxEEAW0CAAF0AAABeAACAWMAAwqjAwQ"
const implBasic = "SQEDfwNAIAEhAEEAIQIDQCAAQQF2IABBAXFBoIbi7X5scyEAIAJBAWoiAkEIRw0ACyABQQJ0IAA2AgAgAUEBaiIBQYACRw0ACwtKACABQX9zIQFBgIAEIAJyIQJBgIAEIABqIQADQCABQf8BcSACLQAAc0ECdCgCACABQQh2cyEBIAJBAWoiAiAASQ0ACyABQX9zuAs"
const implSIMD = "TwEDfwNAQQAhAgNAIAIgAXIoAgAiAEH/AXFBAnQoAgAgAEEIdnMhACACQYAIaiICIAFyIAA2AgAgAkGAGEcNAAsgAUEEaiIBQYAIRw0ACwu7AQICfwF7IAFBf3MhAUGAgAQhAkGAgAQgAGoiAEECdUECdCIDQYSABE8EQANAIAEgAigCAHP9Ef0MA////wL///8B////AP////0OQQL9qwH9DAAAAAAABAAAAAgAAAAMAAD9UCIE/RsAKAIAIAT9GwEoAgBzIAT9GwIoAgBzIAT9GwMoAgBzIQEgAkEEaiICIANHDQALCyACIABJBHwgAEGAgARrIAFBf3MgAkGAgARrEAEFIAFBf3O4Cws"

let enableSIMD = true
try {
  parseWasm([head, test])
} catch(_) {
  enableSIMD = false
}

const instance = new WebAssembly.Instance(parseWasm(
  [head, enableSIMD ? defSIMD : defBasic, implBasic, enableSIMD ? implSIMD : ""]
))
const { t, c, x, m } = instance.exports as {
  t(): void, x(): void, m: WebAssembly.Memory
  c(length: number, init: number): number
}

t() // initialize the table of precomputed CRCs ; this takes 1 kB in the first page of Memory
enableSIMD && x() // extend the table of precomputed CRCs ; this takes another 3 kB

export const memory = m // for testing

// Someday we'll have BYOB stream readers and encodeInto etc.
// When that happens, we should write into this buffer directly.
const pageSize = 0x10000 // 64 kB
const crcBuffer = makeUint8Array(m).subarray(pageSize)

export function crc32(data: Uint8Array, crc = 0) {
  for (const part of splitBuffer(data)) {
    crcBuffer.set(part)
    crc = c(part.length, crc)
  }
  return crc
}

function* splitBuffer(data: Uint8Array) {
  while (data.length > pageSize) {
    yield data.subarray(0, pageSize)
    data = data.subarray(pageSize)
  }
  if (data.length) yield data
}
