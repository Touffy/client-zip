import { makeUint8Array } from "./utils"

const wasm = "AGFzbQEAAAABCgJgAABgAn9/AXwDAwIAAQUDAQABBw0DAW0CAAF0AAABYwABCpABAk4BA38DQCABIQBBACECA0AgAEEBdiAAQQFxQaCG4u1+bHMhACACQQFqIgJBCEcNAAtBgPgDIAFBAnRyIAA2AgAgAUEBaiIBQYACRw0ACws/AQJ/IAFBf3MhAwNAIANB/wFxIAItAABzQQJ0QYD4A3IoAgAgA0EIdnMhAyACQQFqIgIgAEcNAAsgA0F/c7gL"

const instance = new WebAssembly.Instance(
  new WebAssembly.Module(Uint8Array.from(atob(wasm), c => c.charCodeAt(0)))
)
const { t, c, m } = instance.exports as { t(): void, c(length: number, init: number): number, m: WebAssembly.Memory }
t() // initialize the table of precomputed CRCs ; this takes the last 1024 bytes of the Memory

export const memory = m // for testing

// Someday we'll have BYOB stream readers and encodeInto etc.
// When that happens, we should write into this buffer directly.
const maxLength = 0xFC00
const crcBuffer = makeUint8Array(m).subarray(0, maxLength)

export function crc32(data: Uint8Array, crc = 0) {
  for (const part of splitBuffer(data)) {
    crcBuffer.set(part)
    crc = c(part.length, crc)
  }
  return crc
}

function* splitBuffer(data: Uint8Array) {
  while (data.length > maxLength) {
    yield data.subarray(0, maxLength)
    data = data.subarray(maxLength)
  }
  if (data.length) yield data
}
