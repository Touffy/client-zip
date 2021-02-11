import { makeBuffer, makeUint8Array, clampInt16, clampInt32 } from "./utils.ts"
import { crc32 } from "./crc32.ts"
import { formatDOSDateTime } from "./datetime.ts"
import { ZipFileDescription } from "./input.ts"

const fileHeaderSignature = 0x504b_0304, fileHeaderLength = 30
const descriptorSignature = 0x504b_0708, descriptorLength = 24
const centralHeaderSignature = 0x504b_0102, centralHeaderLength = 46
const endSignature = 0x504b_0506, endLength = 22
const zip64HeaderLength = 32
const zip64endRecordSignature = 0x504b_0606, zip64endRecordLength = 56
const zip64endLocatorSignature = 0x504b_0607, zip64endLocatorLength = 20

export async function* loadFiles(files: AsyncIterable<ZipFileDescription>) {
  const centralRecord: Uint8Array[] = []
  let offset = 0n
  let fileCount = 0n

  // write files
  for await (const file of files) {
    yield fileHeader(file)
    yield file.encodedName
    yield zip64ExtraField(file)
    yield* fileData(file)
    yield dataDescriptor(file)

    centralRecord.push(centralHeader(file, offset))
    centralRecord.push(file.encodedName)
    centralRecord.push(zip64ExtraField(file, offset))
    fileCount++
    offset += BigInt(fileHeaderLength + zip64HeaderLength + descriptorLength + file.encodedName.length) + file.uncompressedSize!
  }

  // write central repository
  let centralSize = 0n
  for (const record of centralRecord) {
    yield record
    centralSize += BigInt(record.length)
  }

  const end = makeBuffer(zip64endRecordLength + zip64endLocatorLength +  endLength)
  // 4.3.14 Zip64 end of central directory record
  end.setUint32(0, zip64endRecordSignature)
  end.setBigUint64(4, BigInt(zip64endRecordLength - 12), true)
  end.setUint32(12, 0x1503_2d_00) // UNIX app version 2.1 | ZIP version 4.5
  // leave 8 bytes at zero
  end.setBigUint64(24, fileCount, true)
  end.setBigUint64(32, fileCount, true)
  end.setBigUint64(40, centralSize, true)
  end.setBigUint64(48, offset, true)

  // 4.3.15 Zip64 end of central directory locator
  end.setUint32(56, zip64endLocatorSignature)
  // leave 4 bytes at zero
  end.setBigUint64(64, offset + centralSize + BigInt(zip64endRecordLength), true)
  // leave 4 bytes at zero

  // write ending
  end.setUint32(76, endSignature)
  // skip 4 useless bytes here
  end.setUint16(84, clampInt16(fileCount), true)
  end.setUint16(86, clampInt16(fileCount), true)
  end.setUint32(88, clampInt32(centralSize), true)
  end.setUint32(92, clampInt32(offset), true)
  // leave comment length = zero (2 bytes)
  yield makeUint8Array(end)
}

export function fileHeader(file: ZipFileDescription) {
  const header = makeBuffer(fileHeaderLength)
  header.setUint32(0, fileHeaderSignature)
  header.setUint32(4, 0x2d_00_0800) // ZIP version 4.5 | flags, bit 3 on = size and CRCs will be zero
  // leave compression = zero (2 bytes) until we implement compression
  formatDOSDateTime(file.modDate, header, 10)
  // leave CRC = zero (4 bytes) because we'll write it later, in the central repo
  // leave lengths = zero (2x4 bytes) because we'll write them later, in the central repo
  header.setUint16(26, file.encodedName.length, true)
  header.setUint16(28, zip64HeaderLength, true)
  return makeUint8Array(header)
}

export async function* fileData(file: ZipFileDescription) {
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

export function dataDescriptor(file: ZipFileDescription) {
  const header = makeBuffer(descriptorLength)
  header.setUint32(0, descriptorSignature)
  header.setUint32(4, file.crc!, true)
  header.setBigUint64(8, file.uncompressedSize!, true)
  header.setBigUint64(16, file.uncompressedSize!, true)
  return makeUint8Array(header)
}

export function centralHeader(file: ZipFileDescription, offset: bigint) {
  const header = makeBuffer(centralHeaderLength)
  header.setUint32(0, centralHeaderSignature)
  header.setUint32(4, 0x1503_2d_00) // UNIX app version 2.1 | ZIP version 4.5
  header.setUint16(8, 0x0800) // flags, bit 3 on
  // leave compression = zero (2 bytes) until we implement compression
  formatDOSDateTime(file.modDate, header, 12)
  header.setUint32(16, file.crc!, true)
  header.setUint32(20, clampInt32(file.uncompressedSize!), true)
  header.setUint32(24, clampInt32(file.uncompressedSize!), true)
  header.setUint16(28, file.encodedName.length, true)
  header.setUint16(30, zip64HeaderLength, true)
  // useless disk fields = zero (4 bytes)
  // useless attributes = zero (6 bytes)
  header.setUint32(42, clampInt32(offset), true) // offset
  return makeUint8Array(header)
}

export function zip64ExtraField(file: ZipFileDescription, offset = 0n) {
  const header = makeBuffer(zip64HeaderLength)
  header.setUint16(0, 1)
  header.setUint16(2, zip64HeaderLength - 4, true)
  header.setBigUint64(4, file.uncompressedSize || 0n, true)
  header.setBigUint64(12, file.uncompressedSize || 0n, true)
  header.setBigUint64(20, offset, true)
  // useless 4 bytes
  return makeUint8Array(header)
}
