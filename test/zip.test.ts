import { assertEquals, assertStrictEquals } from "@std/assert"
import { Buffer } from "@std/io/buffer"
import { fileHeader, fileData, deflatedFileData, dataDescriptor, centralHeader, zip64ExtraField, contentLength, flagNameUTF8 } from "../src/zip.ts"
import type { ZipFileDescription, ZipFolderDescription } from "../src/input.ts"
import type { Metadata } from "../src/metadata.ts"

const BufferFromHex = (hex: string) => new Uint8Array(Array.from(hex.matchAll(/.{2}/g), ([s]) => parseInt(s, 16)))

const zipSpec = Deno.readFileSync("./test/APPNOTE.TXT")
const specName = new TextEncoder().encode("APPNOTE.TXT")
const specDate = new Date("2019-04-26T02:00")
const invalidUTF8 = BufferFromHex("fe")

const baseFile: ZipFileDescription & Metadata = Object.freeze(
  { isFile: true, bytes: new Uint8Array(zipSpec), encodedName: specName, nameIsBuffer: false, modDate: specDate, mode: 0o664 })

const baseFolder: ZipFolderDescription & Metadata = Object.freeze(
  { isFile: false, encodedName: new TextEncoder().encode("folder"), nameIsBuffer: false, modDate: specDate, mode: 0o775 })

Deno.test("the ZIP fileHeader function makes file headers", () => {
  const file = {...baseFile}
  const actual = fileHeader(file)
  const expected = BufferFromHex("504b03042d000800000000109a4e0000000000000000000000000b000000")
  assertEquals(actual, expected)
})

Deno.test("the ZIP fileHeader function makes folder headers", () => {
  const folder = {...baseFolder}
  const actual = fileHeader(folder)
  const expected = BufferFromHex("504b03042d000800000000109a4e00000000000000000000000006000000")
  assertEquals(actual, expected)
})

Deno.test("the ZIP fileHeader function merges extra flags", () => {
  const file = {...baseFile}
  const actual = fileHeader(file, 0x808)
  const expected = BufferFromHex("504b03042d000808000000109a4e0000000000000000000000000b000000")
  assertEquals(actual, expected)
})

Deno.test("the ZIP fileHeader function announces ZIP version 2.0 when the file is known to be small", () => {
  const file = {...baseFile, zipVersion: 0x14}
  const actual = fileHeader(file)
  const expected = BufferFromHex("504b030414000800000000109a4e0000000000000000000000000b000000")
  assertEquals(actual, expected)
})

Deno.test("the ZIP fileHeader function sets the DEFLATE method for compressed files", () => {
  const file = {...baseFile, zipVersion: 0x14}
  const actual = fileHeader(file, 0, true)
  const expected = BufferFromHex("504b030414000800080000109a4e0000000000000000000000000b000000")
  assertEquals(actual, expected)
})

Deno.test("the ZIP fileData function yields all the file's data", async () => {
  const file = {...baseFile}
  const actual = new Buffer()
  for await (const chunk of fileData(file)) actual.writeSync(chunk)
  assertEquals(actual.bytes({copy: false}), zipSpec)
})

Deno.test("the ZIP fileData function sets the file's size and CRC properties", async () => {
  const file = {...baseFile}
  assertStrictEquals(file.uncompressedSize, undefined)
  assertStrictEquals(file.crc, undefined)
  for await (const _ of fileData(file));
  assertStrictEquals(file.uncompressedSize, BigInt(zipSpec.length))
  assertStrictEquals(file.crc, 0xbb3afe3f)
})

Deno.test("the ZIP deflatedFileData function yields the file's data compressed with DEFLATE", async () => {
  const file = {...baseFile}
  const compressed = new Buffer()
  for await (const chunk of deflatedFileData(file)) compressed.writeSync(chunk)
  const inflated = await new Response(new Response(compressed.bytes().slice()).body!.pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()
  assertEquals(new Uint8Array(inflated), zipSpec)
})

Deno.test("the ZIP deflatedFileData function sets the original size and CRC, and the compressed size", async () => {
  const file = {...baseFile}
  const compressed = new Buffer()
  for await (const chunk of deflatedFileData(file)) compressed.writeSync(chunk)
  assertStrictEquals(file.uncompressedSize, BigInt(zipSpec.length))
  assertStrictEquals(file.crc, 0xbb3afe3f)
  assertStrictEquals(file.compressedSize, BigInt(compressed.length))
  assertEquals(file.compressedSize! < file.uncompressedSize!, true)
})

Deno.test("the ZIP deflatedFileData function also compresses streams", async () => {
  const file = {...baseFile, bytes: new Blob([zipSpec]).stream()}
  for await (const _ of deflatedFileData(file));
  assertStrictEquals(file.uncompressedSize, BigInt(zipSpec.length))
  assertStrictEquals(file.crc, 0xbb3afe3f)
})

Deno.test("the ZIP dataDescriptor function writes the compressed size first", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040n, compressedSize: 0x01020304n, crc: 0x12345678}
  const actual = dataDescriptor(file, false)
  const expected = BufferFromHex("504b0708785634120403020140302010")
  assertEquals(actual, expected)
})

Deno.test("the ZIP dataDescriptor function makes data descriptors", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040n, crc: 0x12345678}
  const actual = dataDescriptor(file, false)
  const expected = BufferFromHex("504b0708785634124030201040302010")
  assertEquals(actual, expected)
})

Deno.test("the ZIP dataDescriptor function makes ZIP64 data descriptors", () => {
  const file = {...baseFile, uncompressedSize: 0x110203040n, crc: 0x12345678}
  const actual = dataDescriptor(file, true)
  const expected = BufferFromHex("504b07087856341240302010010000004030201001000000")
  assertEquals(actual, expected)
})

Deno.test("the ZIP dataDescriptor function makes folder data descriptors", () => {
  const actual = dataDescriptor(baseFolder, false)
  const expected = BufferFromHex("504b0708000000000000000000000000")
  assertEquals(actual, expected)
})

Deno.test("the ZIP centralHeader function makes central record file headers", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040n, crc: 0x12345678}
  const offset = 0x01020304n
  const actual = centralHeader(file, offset, 0)
  const expected = BufferFromHex("504b01022d032d000800000000109a4e7856341240302010403020100b0000000000000000000000b48104030201")
  assertEquals(actual, expected)
})

Deno.test("the ZIP centralHeader function merges extra flags", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040n, crc: 0x12345678}
  const offset = 0x01020304n
  const actual = centralHeader(file, offset, 0x808)
  const expected = BufferFromHex("504b01022d032d000808000000109a4e7856341240302010403020100b0000000000000000000000b48104030201")
  assertEquals(actual, expected)
})

Deno.test("the ZIP centralHeader function repeats ZIP version 2.0 from the local header", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040n, crc: 0x12345678, zipVersion: 0x14}
  const offset = 0x01020304n
  const actual = centralHeader(file, offset, 0)
  const expected = BufferFromHex("504b01022d0314000800000000109a4e7856341240302010403020100b0000000000000000000000b48104030201")
  assertEquals(actual, expected)
})

Deno.test("the ZIP centralHeader function says ZIP version 4.5 when the entry needs a Zip64 field", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040n, crc: 0x12345678, zipVersion: 0x14}
  const offset = 0x101020304n
  const actual = centralHeader(file, offset, 0, 12)
  const expected = BufferFromHex("504b01022d032d000800000000109a4e7856341240302010403020100b000c000000000000000000b481ffffffff")
  assertEquals(actual, expected)
})

Deno.test("the ZIP centralHeader function sets the DEFLATE method and both sizes for compressed files", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040n, compressedSize: 0x01020304n, crc: 0x12345678, zipVersion: 0x14}
  const offset = 0x01020304n
  const actual = centralHeader(file, offset, 0, 0, true)
  const expected = BufferFromHex("504b01022d0314000800080000109a4e7856341204030201403020100b0000000000000000000000b48104030201")
  assertEquals(actual, expected)
})

Deno.test("the ZIP centralHeader function makes ZIP64 central record file headers", () => {
  const file = {...baseFile, uncompressedSize: 0x110203040n, crc: 0x12345678}
  const offset = 0x101020304n
  const actual = centralHeader(file, offset, 0, 28)
  const expected = BufferFromHex("504b01022d032d000800000000109a4e78563412ffffffffffffffff0b001c000000000000000000b481ffffffff")
  assertEquals(actual, expected)
})

Deno.test("the ZIP centralHeader function points both sizes and the offset to a 28-byte Zip64 field", () => {
  // compressed below 4 GiB, original above, small offset: the Zip64 field holds all three values in order
  const file = {...baseFile, uncompressedSize: 0x140000000n, compressedSize: 0x00500000n, crc: 0x12345678}
  const offset = 0x01020304n
  const actual = centralHeader(file, offset, 0, 28, true)
  const expected = BufferFromHex("504b01022d032d000800080000109a4e78563412ffffffffffffffff0b001c000000000000000000b481ffffffff")
  assertEquals(actual, expected)
  const extra = zip64ExtraField(file, offset, 28)
  assertEquals(extra, BufferFromHex("01001800000000400100000000005000000000000403020100000000"))
})

Deno.test("the ZIP centralHeader function makes central record folder headers", () => {
  const offset = 0x01020304n
  const actual = centralHeader(baseFolder, offset, 0, 0)
  const expected = BufferFromHex("504b01022d032d000800000000109a4e000000000000000000000000060000000000000000000000fd4104030201")
  assertEquals(actual, expected)
})

Deno.test("the ZIP zip64ExtraField function makes Zip64 extra fields", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040n, crc: 0x12345678}
  const offset = 0x01020304n
  const actual = zip64ExtraField(file, offset, 28)
  const expected = BufferFromHex("01001800403020100000000040302010000000000403020100000000")
  assertEquals(actual, expected)
})

Deno.test("the ZIP zip64ExtraField function writes the original size, then the compressed size", () => {
  const file = {...baseFile, uncompressedSize: 0x110203040n, compressedSize: 0x101020304n, crc: 0x12345678}
  const offset = 0x01020304n
  const actual = zip64ExtraField(file, offset, 28)
  const expected = BufferFromHex("01001800403020100100000004030201010000000403020100000000")
  assertEquals(actual, expected)
})

Deno.test("the contentLength function accurately predicts the length of an archive", () => {
  const actual = contentLength([{uncompressedSize: BigInt(zipSpec.byteLength), encodedName: specName}])
  const expected = 171462n
  assertEquals(actual, expected)
})

Deno.test("the contentLength function does not throw on zero-length files", () => {
  const actual = contentLength([{uncompressedSize: 0n, encodedName: specName}])
  const expected = 136n
  assertEquals(actual, expected)
})

Deno.test("the contentLength function accurately predicts the length of a large archive", () => {
  const actual = contentLength([
    {uncompressedSize: 0x110203040n, encodedName: specName},
    {uncompressedSize: BigInt(zipSpec.byteLength), encodedName: specName},
  ])
  const expected = 4565683956n
  assertEquals(actual, expected)
})

Deno.test("the flagNameUTF8 function always turns on bit 11 if the name was not a Buffer", () => {
  const actual = flagNameUTF8({encodedName: specName, nameIsBuffer: false})
  assertEquals(actual, 0b1000)
  assertEquals(flagNameUTF8({encodedName: specName, nameIsBuffer: false}, false), 0b1000)
  assertEquals(flagNameUTF8({encodedName: specName, nameIsBuffer: false}, true), 0b1000)
  assertEquals(flagNameUTF8({encodedName: invalidUTF8, nameIsBuffer: false}, false), 0b1000)
  assertEquals(flagNameUTF8({encodedName: invalidUTF8, nameIsBuffer: false}, true), 0b1000)
})

Deno.test("the flagNameUTF8 function turns on bit 11 if the name is valid UTF-8", () => {
  const actual = flagNameUTF8({encodedName: specName, nameIsBuffer: true})
  assertEquals(actual, 0b1000)
})

Deno.test("the flagNameUTF8 function turns off bit 11 if the name is invalid UTF-8", () => {
  const actual = flagNameUTF8({encodedName: invalidUTF8, nameIsBuffer: true})
  assertEquals(actual, 0)
})

Deno.test("the flagNameUTF8 function does whatever the option says about Buffers", () => {
  assertEquals(flagNameUTF8({encodedName: specName, nameIsBuffer: true}, false), 0)
  assertEquals(flagNameUTF8({encodedName: specName, nameIsBuffer: true}, true), 0b1000)
  assertEquals(flagNameUTF8({encodedName: invalidUTF8, nameIsBuffer: true}, false), 0)
  assertEquals(flagNameUTF8({encodedName: invalidUTF8, nameIsBuffer: true}, true), 0b1000)
})
