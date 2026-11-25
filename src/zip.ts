import { makeBuffer, makeUint8Array, clampInt16, clampInt32 } from "./utils.ts"
import { crc32 } from "./crc32.ts"
import { formatDOSDateTime } from "./datetime.ts"
import type { ZipEntryDescription, ZipFileDescription } from "./input.ts"
import type { Metadata } from "./metadata.ts"
import type { Options } from "./index.ts"

const fileHeaderSignature = 0x504b_0304, fileHeaderLength = 30
const descriptorSignature = 0x504b_0708, descriptorLength = 16
const centralHeaderSignature = 0x504b_0102, centralHeaderLength = 46
const endSignature = 0x504b_0506, endLength = 22
const zip64endRecordSignature = 0x504b_0606, zip64endRecordLength = 56
const zip64endLocatorSignature = 0x504b_0607, zip64endLocatorLength = 20

export type ForAwaitable<T> = AsyncIterable<T> | Iterable<T>

type Zip64FieldLength = 0 | 12 | 28

const zipVersion20 = 0x14, zipVersion45 = 0x2d
/** Uncompressed sizes below this leave room for DEFLATE's expansion of incompressible data in browsers' zlib
 * (5 bytes per 16 KiB stored block, under 2 MiB for a 4 GiB file). If the compressed data still reaches 4 GiB
 * (a runtime that flushes every chunk can expand more), the entry gets its Zip64 field anyway and the central
 * header says 4.5. */
const smallFileLimit = 0xffe0_0000n

export function contentLength(files: Iterable<Omit<Metadata, 'nameIsBuffer'>>): bigint {
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

export function flagNameUTF8({encodedName, nameIsBuffer}: Metadata, buffersAreUTF8?: boolean) {
  // @ts-ignore
  return (!nameIsBuffer || (buffersAreUTF8 ?? tryUTF8(encodedName))) * 0b1000
}
const UTF8Decoder = new TextDecoder('utf8', { fatal: true })
function tryUTF8(str: Uint8Array) {
  try { UTF8Decoder.decode(str) }
  catch { return false }
  return true
}

export async function* loadFiles(files: ForAwaitable<ZipEntryDescription & Metadata>, options: Options) {
  const centralRecord: Uint8Array[] = []
  let offset = 0n
  let fileCount = 0n
  let archiveNeedsZip64 = false

  // write files
  for await (const file of files) {
    const flags = flagNameUTF8(file, options.buffersAreUTF8)
    const compress = file.isFile && !!file.deflate
    // version 2.0 when the size is known in advance and no Zip64 field can be needed for this entry
    file.zipVersion = file.sizeIsExact && file.uncompressedSize! < smallFileLimit ? zipVersion20 : zipVersion45
    yield fileHeader(file, flags, compress)
    yield new Uint8Array(file.encodedName)
    if (file.isFile) {
      yield* compress ? deflatedFileData(file) : fileData(file)
    }
    const dataSize = file.compressedSize ?? file.uncompressedSize!
    const bigFile = file.uncompressedSize! >= 0xffffffffn || dataSize >= 0xffffffffn
    const bigOffset = offset >= 0xffffffffn
    // @ts-ignore
    const zip64HeaderLength = (bigOffset * 12 | bigFile * 28) as Zip64FieldLength
    yield dataDescriptor(file, bigFile)

    centralRecord.push(centralHeader(file, offset, flags, zip64HeaderLength, compress))
    centralRecord.push(file.encodedName)
    if (zip64HeaderLength) centralRecord.push(zip64ExtraField(file, offset, zip64HeaderLength))
    if (bigFile) offset += 8n // because the data descriptor will have 64-bit sizes
    fileCount++
    offset += BigInt(fileHeaderLength + descriptorLength + file.encodedName.length) + dataSize
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

export function fileHeader(file: ZipEntryDescription & Metadata, flags = 0, compress = false) {
  const header = makeBuffer(fileHeaderLength)
  header.setUint32(0, fileHeaderSignature)
  header.setUint32(4, (file.zipVersion ?? zipVersion45) << 24 | 0x00_0800 | flags) // ZIP version | flags, bit 3 on = size and CRCs will be zero
  if (compress) header.setUint16(8, 8, true) // compression method 8 = DEFLATE
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
    file.uncompressedSize = BigInt(bytes.length)
  } else {
    file.uncompressedSize = 0n
    const reader = bytes.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      file.crc = crc32(value!, file.crc)
      file.uncompressedSize += BigInt(value!.length)
      yield value!
    }
  }
}

/** Like fileData, but yields the file's bytes compressed with DEFLATE,
 * while the CRC and uncompressedSize are computed on the original bytes. */
export async function* deflatedFileData(file: ZipFileDescription & Metadata) {
  let { bytes } = file
  if ("then" in bytes) bytes = await bytes
  const source = bytes instanceof Uint8Array
    ? new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes as Uint8Array); controller.close() } })
    : bytes
  file.crc = 0
  file.uncompressedSize = 0n
  file.compressedSize = 0n
  const reader = source.pipeThrough(new TransformStream({
    transform(chunk: Uint8Array, controller) {
      file.crc = crc32(chunk, file.crc)
      file.uncompressedSize! += BigInt(chunk.length)
      controller.enqueue(chunk)
    }
  })).pipeThrough(new CompressionStream("deflate-raw")).getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      file.compressedSize += BigInt(value!.length)
      yield value!
    }
  } finally {
    // release the pipe (and the source) if the archive is abandoned midway
    reader.cancel().catch(() => {})
  }
}

export function dataDescriptor(file: ZipEntryDescription & Metadata, needsZip64: boolean) {
  const header = makeBuffer(descriptorLength + (needsZip64 ? 8 : 0))
  header.setUint32(0, descriptorSignature)
  header.setUint32(4, file.isFile ? file.crc! : 0, true)
  const compressedSize = file.compressedSize ?? file.uncompressedSize!
  if (needsZip64) {
    header.setBigUint64(8, compressedSize, true)
    header.setBigUint64(16, file.uncompressedSize!, true)
  } else {
    header.setUint32(8, clampInt32(compressedSize), true)
    header.setUint32(12, clampInt32(file.uncompressedSize!), true)
  }
  return makeUint8Array(header)
}

export function centralHeader(file: ZipEntryDescription & Metadata, offset: bigint, flags = 0, zip64HeaderLength: Zip64FieldLength = 0, compress = false) {
  const header = makeBuffer(centralHeaderLength)
  header.setUint32(0, centralHeaderSignature)
  // UNIX app version 4.5 | ZIP version 2.0, unless the local header said 4.5 or this entry needs a Zip64 field
  const version = zip64HeaderLength ? zipVersion45 : file.zipVersion ?? zipVersion45
  header.setUint32(4, 0x2d03_00_00 | version << 8)
  header.setUint16(8, 0x0800 | flags) // flags, bit 3 on
  if (compress) header.setUint16(10, 8, true) // compression method 8 = DEFLATE
  formatDOSDateTime(file.modDate, header, 12)
  header.setUint32(16, file.isFile ? file.crc! : 0, true)
  // when the Zip64 field holds the sizes, it holds all three values, so all three fields point to it (APPNOTE 4.5.3)
  const allInZip64 = (zip64HeaderLength & 16) !== 0
  header.setUint32(20, allInZip64 ? 0xffffffff : clampInt32(file.compressedSize ?? file.uncompressedSize!), true)
  header.setUint32(24, allInZip64 ? 0xffffffff : clampInt32(file.uncompressedSize!), true)
  header.setUint16(28, file.encodedName.length, true)
  header.setUint16(30, zip64HeaderLength, true)
  // useless disk fields = zero (4 bytes)
  // useless attributes = zero (4 bytes)
  header.setUint16(40, file.mode | (file.isFile ? 0o100000 : 0o040000), true)
  header.setUint32(42, allInZip64 ? 0xffffffff : clampInt32(offset), true) // offset
  return makeUint8Array(header)
}

export function zip64ExtraField(file: ZipEntryDescription & Metadata, offset: bigint, zip64HeaderLength: Exclude<Zip64FieldLength, 0>) {
  const header = makeBuffer(zip64HeaderLength)
  header.setUint16(0, 1, true)
  header.setUint16(2, zip64HeaderLength - 4, true)
  if (zip64HeaderLength & 16) {
    header.setBigUint64(4, file.uncompressedSize!, true)
    header.setBigUint64(12, file.compressedSize ?? file.uncompressedSize!, true)
  }
  header.setBigUint64(zip64HeaderLength - 8, offset, true)
  return makeUint8Array(header)
}
