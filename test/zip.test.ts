import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.132.0/testing/asserts.ts"
import { Buffer } from "https://deno.land/std@0.132.0/io/buffer.ts"
import { fileHeader, fileData, dataDescriptor, centralHeader, contentLength } from "../src/zip.ts"
import type { ZipFileDescription } from "../src/input.ts"
import type { Metadata } from "../src/metadata.ts";

const BufferFromHex = (hex: string) => new Uint8Array(Array.from(hex.matchAll(/.{2}/g), ([s]) => parseInt(s, 16)))

const BufferToHex = (buffer: Uint8Array) => 
  Array.from(buffer, (b) => b.toString(16).padStart(2, "0")).join("")

const zipSpec = Deno.readFileSync("./test/APPNOTE.TXT")
const specName = new TextEncoder().encode("APPNOTE.TXT")
const specDate = new Date("2019-04-26T02:00")

const baseFile: ZipFileDescription & Metadata = Object.freeze({ bytes: new Uint8Array(zipSpec), encodedName: specName, isEncodedNameUtf8: true, modDate: specDate })

Deno.test("the ZIP fileHeader function makes file headers", () => {
  const file = {...baseFile}
  const actual = fileHeader(file)
  const expected = BufferFromHex("504b030414000808000000109a4e0000000000000000000000000b000000")
  assertEquals(actual, expected)
})

Deno.test("the ZIP fileHeader function makes file headers with EFS off", () => {
  const file = {...baseFile}
  const actual = fileHeader(file, false)
  const expected = BufferFromHex("504b030414000800000000109a4e0000000000000000000000000b000000")
  assertEquals(actual, expected)
})
Deno.test("the ZIP fileHeader function makes file headers with non-UTF-8 encoded names", () => {
  const file = {...baseFile}
  file.isEncodedNameUtf8 = false // encodedName is still utf-8 encoded but let's pretend it is not
  const actual = fileHeader(file)
  const expected = BufferFromHex("504b030414000800000000109a4e0000000000000000000000000b000000")
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
  assertStrictEquals(file.uncompressedSize, zipSpec.length)
  assertStrictEquals(file.crc, 0xbb3afe3f)
})

Deno.test("the ZIP dataDescriptor function makes data descriptors", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040, crc: 0x12345678}
  const actual = dataDescriptor(file)
  const expected = BufferFromHex("504b0708785634124030201040302010")
  assertEquals(actual, expected)
})

Deno.test("the ZIP centralHeader function makes central record file headers", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040, crc: 0x12345678}
  const offset = 0x01020304
  const actual = centralHeader(file, offset)
  const expected = BufferFromHex("504b0102150314000808000000109a4e7856341240302010403020100b0000000000000000000000b48104030201")
  assertEquals(actual, expected)
})

Deno.test("the ZIP centralHeader function makes central record file headers with EFS off", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040, crc: 0x12345678}
  const offset = 0x01020304
  const actual = centralHeader(file, offset, false)
  const expected = BufferFromHex("504b0102150314000800000000109a4e7856341240302010403020100b0000000000000000000000b48104030201")
  assertEquals(actual, expected)
})

Deno.test("the ZIP centralHeader function makes central record file heahers with non-UTF-8 encoded names", () => {
  const file = {...baseFile, uncompressedSize: 0x10203040, crc: 0x12345678}
  file.isEncodedNameUtf8 = false // encodedName is still utf-8 encoded but let's pretend it is not
  const offset = 0x01020304
  const actual = centralHeader(file, offset)
  const expected = BufferFromHex("504b0102150314000800000000109a4e7856341240302010403020100b0000000000000000000000b48104030201")
  assertEquals(actual, expected)
})

Deno.test("the contentLength function accurately predicts the length of an archive", () => {
  const actual = contentLength([{uncompressedSize: zipSpec.byteLength, encodedName: specName}])
  const expected = 171462
  assertEquals(actual, expected)
})

Deno.test("the contentLength function does not throw on zero-length files", () => {
  const actual = contentLength([{uncompressedSize: 0, encodedName: specName}])
  const expected = 136
  assertEquals(actual, expected)
})
