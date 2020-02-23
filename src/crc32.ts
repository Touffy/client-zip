const m = new WebAssembly.Memory({initial:1})
const wasm = "AGFzbQEAAAABCgJgAABgAn9/AXwCCAEBaQFtAgABAwMCAAEHCQIBdAAAAWMAAQqQAQJOAQN/A0AgASEAQQAhAgNAIABBAXYgAEEBcUGghuLtfmxzIQAgAkEBaiICQQhHDQALQYD4AyABQQJ0ciAANgIAIAFBAWoiAUGAAkcNAAsLPwECfyABQX9zIQMDQCADQf8BcSACLQAAc0ECdEGA+ANyKAIAIANBCHZzIQMgAkEBaiICIABHDQALIANBf3O4Cw"

const instance = new WebAssembly.Instance(
  new WebAssembly.Module(Uint8Array.from(atob(wasm), c => c.charCodeAt(0))),
  { i: { m } } // these identifers are hardcoded in the WebAssembly
)
const { t, c } = instance.exports as { t(): void, c(length: number, init: number): number }
t() // initialize the table of precomputed CRCs ; this takes the last 1024 bytes of the Memory

// Someday we'll have BYOB stream readers and encodeInto etc.
// When that happens, we should write into this buffer directly.
const maxLength = 0xFC00
const crcBuffer = new Uint8Array(m.buffer).subarray(0, maxLength)

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
