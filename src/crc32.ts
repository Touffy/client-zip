import { makeUint8Array, parseBase64 } from "./utils.ts"

const wasm = "AGFzbQEAAAABCgJgAABgAn9/AXwDAwIAAQUDAQACBw0DAW0CAAF0AAABYwABCpUBAkkBA38DQCABIQBBACECA0AgAEEBdiAAQQFxQaCG4u1+bHMhACACQQFqIgJBCEcNAAsgAUECdCAANgIAIAFBAWoiAUGAAkcNAAsLSQEBfyABQX9zIQFBgIAEIQJBgIAEIABqIQADQCABQf8BcSACLQAAc0ECdCgCACABQQh2cyEBIAJBAWoiAiAASQ0ACyABQX9zuAs"
const instance = new WebAssembly.Instance(new WebAssembly.Module(parseBase64(wasm)))
let { t, c, m } = instance.exports as { t(): void, c(length: number, init: number): number, m: WebAssembly.Memory }
t() // initialize the table of precomputed CRCs ; this takes up to 4 kB in the first page of Memory
export const memory = m // for testing

// Someday we'll have BYOB stream readers and encodeInto etc.
// When that happens, we should write into this buffer directly.
const pageSize = 0x10000 // 64 kB
const crcBuffer = makeUint8Array(m).subarray(pageSize)

/** Load the SIMD-enabled CRC32 module for improved performance.
 * @param url the location of the crc32x4.wasm file ; by default, it should be next to the client-zip index */
export async function useSimd(url: string | URL = new URL("crc32x4.wasm", import.meta.url)) {
  if (WebAssembly.validate(parseBase64("AGFzbQEAAAABBQFgAAF7AwIBAAoKAQgAQQD9D/1iCw"))) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP error ${res.status}.`)
    const source = await WebAssembly.instantiate(await res.arrayBuffer(), { m: { m } }) as WebAssembly.WebAssemblyInstantiatedSource
    ({ t, c } = source.instance.exports as { t(): void, c(length: number, init: number): number })
    t()
  }
}

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
