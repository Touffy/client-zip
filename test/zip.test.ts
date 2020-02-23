const fs = require("fs")
import { fileHeader, fileData, dataDescriptor, centralHeader } from "../src/zip"
import { ZipFileDescription } from "../src/input"

const zipSpec = fs.readFileSync(__dirname + "/APPNOTE.TXT")
const specName = new TextEncoder().encode("APPNOTE.TXT")
const specDate = new Date("2019-04-26Z")

describe("The ZIP module", () => {
  let file: ZipFileDescription = { bytes: new Uint8Array(zipSpec), encodedName: specName, modDate: specDate }

  afterEach(() => {
    delete file.uncompressedSize
    delete file.crc
  })

  describe("the fileHeader function", () => {
    it("should make file headers", () => {
      const actual = fileHeader(file)
      const expected = new Uint8Array(Buffer.from("504b03041400080000004e9a00000000000000000000000000000b000000", "hex"))
      expect(actual).toEqual(expected)
    })
  })

  describe("the fileData function", () => {
    it("should yield all the file's data", async () => {
      const chunks = []
      for await (const chunk of fileData(file)) chunks.push(chunk)
      const actual = Buffer.concat(chunks)
      expect(actual).toEqual(zipSpec)
    })

    it("should set the file's size and CRC properties", async () => {
      expect(file.uncompressedSize).toBeUndefined()
      expect(file.crc).toBeUndefined()
      for await (const _ of fileData(file));
      expect(file.uncompressedSize).toEqual(zipSpec.length)
      expect(file.crc).toEqual(0xbb3afe3f)
    })
  })

  describe("the dataDescriptor function", () => {
    beforeEach(() => {
      file.uncompressedSize = 0x10203040
      file.crc = 0x12345678
    })

    it("should make data descriptors", () => {
      const actual = dataDescriptor(file)
      const expected = new Uint8Array(Buffer.from("504b0708785634124030201040302010", "hex"))
      expect(actual).toEqual(expected)
    })
  })

  describe("the centralHeader function", () => {
    beforeEach(() => {
      file.uncompressedSize = 0x10203040
      file.crc = 0x12345678
    })

    it("should make central record file headers", () => {
      const offset = 0x01020304
      const actual = centralHeader(file, offset)
      const expected = new Uint8Array(Buffer.from("504b010215031400080000004e9a00007856341240302010403020100b0000000000000000000000000004030201", "hex"))
      expect(actual).toEqual(expected)
    })
  })
})
