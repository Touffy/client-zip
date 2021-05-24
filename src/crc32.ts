import { makeUint8Array } from "./utils.ts"

const wasm = "AGFzbQEAAAABCgJgAABgAn9/AXwDAwIAAQUDAQACBw0DAW0CAAF0AAABYwABCusCApgBAQN/A0AgASEAQQAhAgNAIABBAXYgAEEBcUGghuLtfmxzIQAgAkEBaiICQQhHDQALIAFBAnQgADYCACABQQFqIgFBgAJHDQALQQAhAQNAQQAhAgNAIAIgAXIoAgAiAEH/AXFBAnQoAgAgAEEIdnMhACACQYAIaiICIAFyIAA2AgAgAkGAOEcNAAsgAUEEaiIBQYAIRw0ACwvOAQICfwF7IAFBf3MhAUGAgAQhAkGAgAQgAGoiAEECdUECdCIDQYSABE8EQANAIAEgAigCAHP9Ef0MA////wL///8B////AP////0OQQL9qwH9DAAAAAAABAAAAAgAAAAMAAD9UCIE/RsAKAIAIAT9GwEoAgBzIAT9GwIoAgBzIAT9GwMoAgBzIQEgAkEEaiICIANHDQALCyACIABJBEADQCABQf8BcSACLQAAc0ECdCgCACABQQh2cyEBIAJBAWoiAiAASQ0ACwsgAUF/c7gL"

const instance = new WebAssembly.Instance(
  new WebAssembly.Module(Uint8Array.from(atob(wasm), c => c.charCodeAt(0)))
)
const { t, c, m } = instance.exports as { t(): void, c(length: number, init: number): number, m: WebAssembly.Memory }
t() // initialize the table of precomputed CRCs ; this takes 8 kB in the second page of Memory
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
