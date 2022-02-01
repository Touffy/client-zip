import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { crc32, memory, useSimd } from "../src/crc32.ts"

const table = await Deno.readFile("./test/table.array")

Deno.test("the CRC32 module precomputes CRCs for each byte using the polynomial 0xEDB88320", () => {
  const actual = new Uint8Array(memory.buffer).subarray(0, 0x400)
  const expected = table.subarray(0, 0x400)
  assertEquals(actual, expected)
})

Deno.test("the CRC32x4 module precomputes 3 more rows of CRCs", async () => {
  await withFakeFetch(useSimd, Deno.readFile("./crc32x4.wasm"))
  const actual = new Uint8Array(memory.buffer).subarray(0x400, 0x1000)
  const expected = table.subarray(0x400, 0x1000)
  assertEquals(actual, expected)
})

Deno.test("the CRC32 for an empty file", () => {
  assertEquals(crc32(new Uint8Array(0), 0), 0)
})

Deno.test("the CRC32 for short files", () => {
  assertEquals(crc32(new TextEncoder().encode("Hello world!"), 0), 0x1b851995)
  assertEquals(crc32(new TextEncoder().encode("WebAssmebly is fun. Also 10x faster than JavaScript for this."), 0), 0x8a89a52a)
  assertEquals(crc32(new Uint8Array(table), 0), 0x1a76768f)
})

Deno.test("the CRC32 for files larger than 64kB", () => {
  const zipSpec = Deno.readFileSync("./test/APPNOTE.TXT")
  assertEquals(crc32(new Uint8Array(zipSpec), 0), 0xbb3afe3f)
})

async function withFakeFetch(f: () => Promise<void>, data: Promise<Uint8Array>) {
  const realFetch = globalThis.fetch
  // @ts-ignore (mock fetch so crc32 module can get a wasm without HTTP)
  globalThis.fetch = (_: string) => Promise.resolve({ arrayBuffer: () => data, ok: true })
  await f()
  // we can restore fetch now
  globalThis.fetch = realFetch
}
