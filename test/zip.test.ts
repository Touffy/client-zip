import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.132.0/testing/asserts.ts"
import { Buffer } from "https://deno.land/std@0.132.0/io/buffer.ts"
import { fileHeader, fileData, dataDescriptor, centralHeader, zip64ExtraField, contentLength, flagNameUTF8 } from "../src/zip.ts"
import type { ZipFileDescription, ZipFolderDescription } from "../src/input.ts"
import type { Metadata } from "../src/metadata.ts"

const BufferFromHex = (hex: string) => new Uint8Array(Array.from(hex.matchAll(/.{2}/g), ([s]) => parseInt(s, 16)))

const zipSpec = Deno.readFileSync("./test/APPNOTE.TXT")
const specName = new TextEncoder().encode("APPNOTE.TXT")
const specDate = new Date("2019-04-26T02:00")
const invalidUTF8 = BufferFromHex("fe")

const baseFile: ZipFileDescription & Metadata = Object.freeze(
  { isFile: true, bytes: new Uint8Array(zipSpec), encodedName: specName, nameIsBuffer: false, modDate: specDate })

const baseFolder: ZipFolderDescription & Metadata = Object.freeze(
  { isFile: false, encodedName: new TextEncoder().encode("folder"), nameIsBuffer: false, modDate: specDate })

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

Deno.test("the ZIP centralHeader function makes ZIP64 central record file headers", () => {
  const file = {...baseFile, uncompressedSize: 0x110203040n, crc: 0x12345678}
  const offset = 0x101020304n
  const actual = centralHeader(file, offset, 0, 28)
  const expected = BufferFromHex("504b01022d032d000800000000109a4e78563412ffffffffffffffff0b001c000000000000000000b481ffffffff")
  assertEquals(actual, expected)
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
