import { makeBuffer, makeUint8Array, clampInt16, clampInt32 } from "./utils.ts"
import { crc32 } from "./crc32.ts"
import { formatDOSDateTime } from "./datetime.ts"
import type { ZipEntryDescription, ZipFileDescription } from "./input.ts"
import { Metadata } from "./metadata.ts"

const fileHeaderSignature = 0x504b_0304, fileHeaderLength = 30
const descriptorSignature = 0x504b_0708, descriptorLength = 16
const centralHeaderSignature = 0x504b_0102, centralHeaderLength = 46
const endSignature = 0x504b_0506, endLength = 22
const zip64endRecordSignature = 0x504b_0606, zip64endRecordLength = 56
const zip64endLocatorSignature = 0x504b_0607, zip64endLocatorLength = 20

export type ForAwaitable<T> = AsyncIterable<T> | Iterable<T>

type Zip64FieldLength = 0 | 12 | 28

export function contentLength(files: Iterable<Metadata>) {
  let centralLength = BigInt(endLength)
  let offset = 0n
  let archiveNeedsZip64 = false
  for (const file of files) {
    if (!file.encodedName) throw new Error("Every file must have a non-empty name.")
    if (file.uncompressedSize === undefined)
      throw new Error(`Missing size for file "${new TextDecoder().decode(file.encodedName)}".`)
    const bigFile = file.uncompressedSize! >= 0xffffffffn
    const bigOffset = offset >= 0xffffffffn
    // @ts-ignore
    offset += BigInt(fileHeaderLength + descriptorLength + file.encodedName.length + (bigFile && 8)) + file.uncompressedSize
    // @ts-ignore
    centralLength += BigInt(file.encodedName.length + centralHeaderLength + (bigOffset * 12 | bigFile * 28))
    archiveNeedsZip64 ||= bigFile
  }
  if (archiveNeedsZip64 || offset >= 0xffffffffn)
    centralLength += BigInt(zip64endRecordLength + zip64endLocatorLength)
  return centralLength + offset
}

export async function* loadFiles(files: ForAwaitable<ZipEntryDescription & Metadata>, markerBeforeFileStart: any = null, markerAfterFileEnd: any = null) {
  const centralRecord: Uint8Array[] = []
  let offset = 0n
  let fileCount = 0n
  let archiveNeedsZip64 = false

  // write files
  for await (const file of files) {
    yield fileHeader(file)
    yield file.encodedName
    if (file.isFile) {
      yield* fileData(file, markerBeforeFileStart, markerAfterFileEnd)
    }
    const bigFile = file.uncompressedSize! >= 0xffffffffn
    const bigOffset = offset >= 0xffffffffn
    // @ts-ignore
    const zip64HeaderLength = (bigOffset * 12 | bigFile * 28) as Zip64FieldLength
    yield dataDescriptor(file, bigFile)

    centralRecord.push(centralHeader(file, offset, zip64HeaderLength))
    centralRecord.push(file.encodedName)
    if (zip64HeaderLength) centralRecord.push(zip64ExtraField(file, offset, zip64HeaderLength))
    if (bigFile) offset += 8n // because the data descriptor will have 64-bit sizes
    fileCount++
    offset += BigInt(fileHeaderLength + descriptorLength + file.encodedName.length) + file.uncompressedSize!
    archiveNeedsZip64 ||= bigFile
  }

  // write central repository
  let centralSize = 0n
  for (const record of centralRecord) {
    yield record
    centralSize += BigInt(record.length)
  }

  if (archiveNeedsZip64 || offset >= 0xffffffffn) {
    const endZip64 = makeBuffer(zip64endRecordLength + zip64endLocatorLength)
    // 4.3.14 Zip64 end of central directory record
    endZip64.setUint32(0, zip64endRecordSignature)
    endZip64.setBigUint64(4, BigInt(zip64endRecordLength - 12), true)
    endZip64.setUint32(12, 0x2d03_2d_00) // UNIX app version 4.5 | ZIP version 4.5
    // leave 8 bytes at zero
    endZip64.setBigUint64(24, fileCount, true)
    endZip64.setBigUint64(32, fileCount, true)
    endZip64.setBigUint64(40, centralSize, true)
    endZip64.setBigUint64(48, offset, true)

    // 4.3.15 Zip64 end of central directory locator
    endZip64.setUint32(56, zip64endLocatorSignature)
    // leave 4 bytes at zero
    endZip64.setBigUint64(64, offset + centralSize, true)
    endZip64.setUint32(72, 1, true)
    yield makeUint8Array(endZip64)
  }

  const end = makeBuffer(endLength)
  end.setUint32(0, endSignature)
  // skip 4 useless bytes here
  end.setUint16(8, clampInt16(fileCount), true)
  end.setUint16(10, clampInt16(fileCount), true)
  end.setUint32(12, clampInt32(centralSize), true)
  end.setUint32(16, clampInt32(offset), true)
  // leave comment length = zero (2 bytes)
  yield makeUint8Array(end)
}

export function fileHeader(file: ZipEntryDescription & Metadata) {
  const header = makeBuffer(fileHeaderLength)
  header.setUint32(0, fileHeaderSignature)
  header.setUint32(4, 0x2d_00_0800) // ZIP version 4.5 | flags, bit 3 on = size and CRCs will be zero
  // leave compression = zero (2 bytes) until we implement compression
  formatDOSDateTime(file.modDate, header, 10)
  // leave CRC = zero (4 bytes) because we'll write it later, in the central repo
  // leave lengths = zero (2x4 bytes) because we'll write them later, in the central repo
  header.setUint16(26, file.encodedName.length, true)
  // leave extra field length = zero (2 bytes)
  return makeUint8Array(header)
}

export async function* fileData(file: ZipFileDescription & Metadata, markerBeforeFileStart: any = null, markerAfterFileEnd: any = null) {
  let { bytes } = file
  if ("then" in bytes) bytes = await bytes
  if (bytes instanceof Uint8Array) {
    yield bytes
    file.crc = crc32(bytes, 0)
    file.uncompressedSize = BigInt(bytes.length)
  } else {
    file.uncompressedSize = 0n
    const reader = bytes.getReader()
    if (markerBeforeFileStart) {
      yield markerBeforeFileStart
    }
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      file.crc = crc32(value!, file.crc)
      file.uncompressedSize += BigInt(value!.length)
      yield value!
    }
    if (markerAfterFileEnd) {
      yield markerAfterFileEnd
    }
  }
}

export function dataDescriptor(file: ZipEntryDescription & Metadata, needsZip64: boolean) {
  const header = makeBuffer(descriptorLength + (needsZip64 ? 8 : 0))
  header.setUint32(0, descriptorSignature)
  header.setUint32(4, file.isFile ? file.crc! : 0, true)
  if (needsZip64) {
    header.setBigUint64(8, file.uncompressedSize!, true)
    header.setBigUint64(16, file.uncompressedSize!, true)
  } else {
    header.setUint32(8, clampInt32(file.uncompressedSize!), true)
    header.setUint32(12, clampInt32(file.uncompressedSize!), true)
  }
  return makeUint8Array(header)
}

export function centralHeader(file: ZipEntryDescription & Metadata, offset: bigint, zip64HeaderLength: Zip64FieldLength = 0) {
  const header = makeBuffer(centralHeaderLength)
  header.setUint32(0, centralHeaderSignature)
  header.setUint32(4, 0x2d03_2d_00) // UNIX app version 4.5 | ZIP version 4.5
  header.setUint16(8, 0x0800) // flags, bit 3 on
  // leave compression = zero (2 bytes) until we implement compression
  formatDOSDateTime(file.modDate, header, 12)
  header.setUint32(16, file.isFile ? file.crc! : 0, true)
  header.setUint32(20, clampInt32(file.uncompressedSize!), true)
  header.setUint32(24, clampInt32(file.uncompressedSize!), true)
  header.setUint16(28, file.encodedName.length, true)
  header.setUint16(30, zip64HeaderLength, true)
  // useless disk fields = zero (4 bytes)
  // useless attributes = zero (4 bytes)
  header.setUint16(40, file.isFile ? 0o100664 : 0o040775, true) // UNIX regular file with permissions 664, or folder with permission 775.
  header.setUint32(42, clampInt32(offset), true) // offset
  return makeUint8Array(header)
}

export function zip64ExtraField(file: ZipEntryDescription & Metadata, offset: bigint, zip64HeaderLength: Exclude<Zip64FieldLength, 0>) {
  const header = makeBuffer(zip64HeaderLength)
  header.setUint16(0, 1, true)
  header.setUint16(2, zip64HeaderLength - 4, true)
  if (zip64HeaderLength & 16) {
    header.setBigUint64(4, file.uncompressedSize!, true)
    header.setBigUint64(12, file.uncompressedSize!, true)
  }
  header.setBigUint64(zip64HeaderLength - 8, offset, true)
  return makeUint8Array(header)
}
