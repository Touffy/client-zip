// @ts-ignore
import { makeUint8Array } from "./utils.ts"

const wasm = "AGFzbQEAAAABCgJgAABgAn9/AXwDAwIAAQUDAQACBw0DAW0CAAF0AAABYwABCpUBAkkBA38DQCABIQBBACECA0AgAEEBdiAAQQFxQaCG4u1+bHMhACACQQFqIgJBCEcNAAsgAUECdCAANgIAIAFBAWoiAUGAAkcNAAsLSQEBfyABQX9zIQFBgIAEIQJBgIAEIABqIQADQCABQf8BcSACLQAAc0ECdCgCACABQQh2cyEBIAJBAWoiAiAASQ0ACyABQX9zuAs"

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
