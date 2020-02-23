const fs = require("fs")
import { crc32, m } from "../src/crc32"
import table from "./table"

describe("The CRC32 module", () => {
  it("should precompute CRCs for each byte using the polynomial 0xEDB88320", () => {
    const actual = new Uint32Array(m.buffer).subarray(0x3f00)
    const expected = table
    expect(actual).toEqual(expected)
  })

  it("should compute the correct CRC32 for an empty file", () => {
    expect(crc32(new Uint8Array(), 0)).toEqual(0)
  })

  it("should compute the correct CRC32 for short files", () => {
    expect(crc32(new TextEncoder().encode("Hello world!"), 0)).toEqual(0x1b851995)
    expect(crc32(new TextEncoder().encode("WebAssmebly is fun. Also 10x faster than JavaScript for this."), 0)).toEqual(0x8a89a52a)
    expect(crc32(new Uint8Array(table.buffer), 0)).toEqual(0x6fcf9e13)
  })

  it("should compute the correct CRC32 for files larger than 63kB", () => {
    const zipSpec: Buffer = fs.readFileSync(__dirname + "/APPNOTE.TXT")
    expect(crc32(new Uint8Array(zipSpec), 0)).toEqual(0xbb3afe3f)
  })
})
