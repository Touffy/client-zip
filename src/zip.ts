import { makeBuffer, makeUint8Array } from "./utils.ts"
import { crc32 } from "./crc32.ts"
import { formatDOSDateTime } from "./datetime.ts"
import type { ZipFileDescription } from "./input.ts"
import type { Metadata } from "./metadata.ts"
import type { Options } from "./index.ts"

const fileHeaderSignature = 0x504b_0304, fileHeaderLength = 30
const descriptorSignature = 0x504b_0708, descriptorLength = 16
const centralHeaderSignature = 0x504b_0102, centralHeaderLength = 46
const endSignature = 0x504b_0506, endLength = 22
const fileOverhead = descriptorLength + fileHeaderLength + centralHeaderLength

export type ForAwaitable<T> = AsyncIterable<T> | Iterable<T>

export function contentLength(files: Iterable<Metadata>): number {
  let length = endLength
  for (const file of files) {
    if (!file.encodedName) throw new Error("Every file must have a non-empty name.")
    if (isNaN(file.uncompressedSize ?? NaN))
      throw new Error(`Missing size for file "${new TextDecoder().decode(file.encodedName)}".`)
    length += file.encodedName.length * 2 + file.uncompressedSize! + fileOverhead
  }
  return length
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

export async function* loadFiles(files: ForAwaitable<ZipFileDescription & Metadata>, options: Options) {
  const centralRecord: Uint8Array[] = []
  let offset = 0
  let fileCount = 0

  // write files
  for await (const file of files) {
    const flags = flagNameUTF8(file, options.buffersAreUTF8)
    const compress = !!options.compress
    yield fileHeader(file, flags, compress)
    yield new Uint8Array(file.encodedName)
    yield* compress ? deflatedFileData(file) : fileData(file)
    yield dataDescriptor(file)

    centralRecord.push(centralHeader(file, offset, flags, compress))
    centralRecord.push(file.encodedName)
    fileCount++
    offset += fileHeaderLength + descriptorLength + file.encodedName.length + (file.compressedSize ?? file.uncompressedSize!)
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

export function fileHeader(file: ZipFileDescription & Metadata, flags = 0, compress = false) {
  const header = makeBuffer(fileHeaderLength)
  header.setUint32(0, fileHeaderSignature)
  header.setUint32(4, 0x14_00_0800 | flags) // ZIP version 2.0 | flags, bit 3 on = size and CRCs will be zero
  if (compress) header.setUint16(8, 8, true) // compression method = DEFLATE
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

/** Like fileData, but yields the file's bytes compressed with DEFLATE,
 * while the CRC and uncompressedSize are computed on the original bytes. */
export async function* deflatedFileData(file: ZipFileDescription & Metadata) {
  let { bytes } = file
  if ("then" in bytes) bytes = await bytes
  const source = bytes instanceof Uint8Array
    ? new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes as Uint8Array); controller.close() } })
    : bytes
  file.crc = 0
  file.uncompressedSize = 0
  file.compressedSize = 0
  const reader = source.pipeThrough(new TransformStream({
    transform(chunk: Uint8Array, controller) {
      file.crc = crc32(chunk, file.crc)
      file.uncompressedSize! += chunk.length
      controller.enqueue(chunk)
    }
  })).pipeThrough(new CompressionStream("deflate-raw")).getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      file.compressedSize += value!.length
      yield value!
    }
  } finally {
    reader.cancel()
  }
}

export function dataDescriptor(file: ZipFileDescription & Metadata) {
  const header = makeBuffer(16)
  header.setUint32(0, descriptorSignature)
  header.setUint32(4, file.crc!, true)
  header.setUint32(8, file.compressedSize ?? file.uncompressedSize!, true)
  header.setUint32(12, file.uncompressedSize!, true)
  return makeUint8Array(header)
}

export function centralHeader(file: ZipFileDescription & Metadata, offset: number, flags = 0, compress = false) {
  const header = makeBuffer(centralHeaderLength)
  header.setUint32(0, centralHeaderSignature)
  header.setUint32(4, 0x1503_14_00) // UNIX app version 2.1 | ZIP version 2.0
  header.setUint16(8, 0x0800 | flags) // flags, bit 3 on
  if (compress) header.setUint16(10, 8, true) // compression method = DEFLATE
  formatDOSDateTime(file.modDate, header, 12)
  header.setUint32(16, file.crc!, true)
  header.setUint32(20, file.compressedSize ?? file.uncompressedSize!, true)
  header.setUint32(24, file.uncompressedSize!, true)
  header.setUint16(28, file.encodedName.length, true)
  // leave extra field length = zero (2 bytes)
  // useless disk fields = zero (4 bytes)
  // useless attributes = zero (4 bytes)
  header.setUint16(40, file.mode | 0o100000, true)
  header.setUint32(42, offset, true) // offset
  return makeUint8Array(header)
}
