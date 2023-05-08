import { makeBuffer, makeUint8Array } from "./utils.ts"
import { crc32 } from "./crc32.ts"
import { formatDOSDateTime } from "./datetime.ts"
import { ZipFileDescription } from "./input.ts"
import { Metadata } from "./metadata.ts"
import { Options } from "./index.ts"

const fileHeaderSignature = 0x504b_0304, fileHeaderLength = 30
const descriptorSignature = 0x504b_0708, descriptorLength = 16
const centralHeaderSignature = 0x504b_0102, centralHeaderLength = 46
const endSignature = 0x504b_0506, endLength = 22
const fileOverhead = descriptorLength + fileHeaderLength + centralHeaderLength

export function contentLength(files: Iterable<Metadata>) {
  let length = endLength
  for (const file of files) {
    if (!file.encodedName) throw new Error("Every file must have a non-empty name.")
    if (isNaN(file.uncompressedSize ?? NaN))
      throw new Error(`Missing size for file "${new TextDecoder().decode(file.encodedName)}".`)
    length += file.encodedName.length * 2 + file.uncompressedSize! + fileOverhead
  }
  return length
}

export async function* loadFiles(files: AsyncIterable<ZipFileDescription & Metadata>, options: Options) {
  const centralRecord: Uint8Array[] = []
  let offset = 0
  let fileCount = 0

  // write files
  for await (const file of files) {
    yield fileHeader(file, options.useLanguageEncodingFlag)
    yield file.encodedName
    yield* fileData(file)
    yield dataDescriptor(file)

    centralRecord.push(centralHeader(file, offset, options.useLanguageEncodingFlag))
    centralRecord.push(file.encodedName)
    fileCount++
    offset += fileHeaderLength + descriptorLength + file.encodedName.length + file.uncompressedSize!
  }

  // write central repository
  let centralSize = 0
  for (const record of centralRecord) {
    yield record
    centralSize += record.length
  }

  // write ending
  const end = makeBuffer(endLength)
  end.setUint32(0, endSignature)
  // skip 4 useless bytes here
  end.setUint16(8, fileCount, true)
  end.setUint16(10, fileCount, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  // leave comment length = zero (2 bytes)
  yield makeUint8Array(end)
}

export function fileHeader(file: ZipFileDescription & Metadata, useLanguageEncodingFlag = true) {
  const header = makeBuffer(fileHeaderLength)
  header.setUint32(0, fileHeaderSignature)
  header.setUint16(4, 0x14_00) // ZIP version 2.0
  // @ts-ignore
  // flags, bit 3 on = size and CRCs will be zero, bit 11 on if filename is utf-8
  header.setUint16(6, 0x0800 | (file.isEncodedNameUtf8 && useLanguageEncodingFlag && 8))
  // leave compression = zero (2 bytes) until we implement compression
  formatDOSDateTime(file.modDate, header, 10)
  // leave CRC = zero (4 bytes) because we'll write it later, in the central repo
  // leave lengths = zero (2x4 bytes) because we'll write them later, in the central repo
  header.setUint16(26, file.encodedName.length, true)
  // leave extra field length = zero (2 bytes)
  return makeUint8Array(header)
}

export async function* fileData(file: ZipFileDescription & Metadata) {
  let { bytes } = file
  if ("then" in bytes) bytes = await bytes
  if (bytes instanceof Uint8Array) {
    yield bytes
    file.crc = crc32(bytes, 0)
    file.uncompressedSize = bytes.length
  } else {
    file.uncompressedSize = 0
    const reader = bytes.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      file.crc = crc32(value!, file.crc)
      file.uncompressedSize += value!.length
      yield value!
    }
  }
}

export function dataDescriptor(file: ZipFileDescription & Metadata) {
  const header = makeBuffer(16)
  header.setUint32(0, descriptorSignature)
  header.setUint32(4, file.crc!, true)
  header.setUint32(8, file.uncompressedSize!, true)
  header.setUint32(12, file.uncompressedSize!, true)
  return makeUint8Array(header)
}

export function centralHeader(file: ZipFileDescription & Metadata, offset: number, useLanguageEncodingFlag = true) {
  const header = makeBuffer(centralHeaderLength)
  header.setUint32(0, centralHeaderSignature)
  header.setUint32(4, 0x1503_14_00) // UNIX app version 2.1 | ZIP version 2.0
  if (file.isEncodedNameUtf8 && useLanguageEncodingFlag)
    header.setUint16(8, 0x0808) // flags, bit 3 on and bit 11 on
  else
    header.setUint16(8, 0x0800) // flags, bit 3 on
  // leave compression = zero (2 bytes) until we implement compression
  formatDOSDateTime(file.modDate, header, 12)
  header.setUint32(16, file.crc!, true)
  header.setUint32(20, file.uncompressedSize!, true)
  header.setUint32(24, file.uncompressedSize!, true)
  header.setUint16(28, file.encodedName.length, true)
  // leave extra field length = zero (2 bytes)
  // useless disk fields = zero (4 bytes)
  // useless attributes = zero (4 bytes)
  header.setUint16(40, 0o100664, true) // UNIX regular file, permissions 664
  header.setUint32(42, offset, true) // offset
  return makeUint8Array(header)
}
