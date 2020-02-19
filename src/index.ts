import "./polyfills.js"
import { makeBuffer, makeUint8Array } from "./utils.js"
import { crc32 } from "./crc32.js"
import { formatDOSDateTime } from "./datetime.js"
import { ZipFileDescription, BufferLike, StreamLike, normalizeInput, ReadableFromIter } from "./input.js"

/** The file name and modification date will be read from the input;
 * extra arguments can be given to override the input's metadata. */
type InputWithMeta = File | Response | { input: File | Response, name?, modDate?}

/** The file name and modification must be provided with those types of input. */
type InputWithoutMeta = { input: BufferLike | StreamLike, name, modDate }

async function* normalizeFiles(files: AsyncIterable<InputWithMeta | InputWithoutMeta>) {
  for await (const file of files) {
    if (file instanceof File || file instanceof Response) yield normalizeInput(file)
    else yield normalizeInput(file.input, file.name, file.modDate)
  }
}

export const downloadZip = (files: AsyncIterable<InputWithMeta | InputWithoutMeta>) => new Response(
  ReadableFromIter(loadFiles(normalizeFiles(files))),
  { headers: { "Content-Type": "application/zip" } }
)

const fileSignature = 0x504b0304
const repoSignature = 0x504b0102
const endSignature = 0x504b0506

async function* loadFiles(files: AsyncIterable<ZipFileDescription>) {
  const centralRecord: Uint8Array[] = []
  let offset = 0
  let fileCount = 0

  // write files
  for await (const file of files) {
    const [header, name] = fileHeader(file)
    yield header
    yield name

    // this part should be in a separate function but it's tricky, handling both data yields and CRC+size
    let size = 0
    let crc = -0x100000000
    let { data } = file
    if ("then" in data) data = await data
    if (data instanceof Uint8Array) {
      yield data
      crc = crc32(data, crc)
      size = data.length
    } else {
      const reader = data.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        crc = crc32(value, crc)
        size += value.length
        yield value
      }
    }

    Object.assign(file, { size, crc })
    centralHeader(file, offset, centralRecord)
    fileCount++
    offset += header.length + name.length + file.size
  }

  // write central repository
  let centralSize = 0
  for (const record of centralRecord) {
    yield record
    centralSize += record.length
  }

  // write ending
  const end = makeBuffer(22)
  end.setUint32(0, endSignature)
  // skip 4 useless bytes here
  end.setUint16(8, fileCount, true)
  end.setUint16(10, fileCount, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  // leave comment length = zero (2 bytes)
  yield makeUint8Array(end)
}

function fileHeader(file: ZipFileDescription) {
  const header = makeBuffer(30)
  header.setUint32(0, fileSignature)
  header.setUint16(4, 0x1400) // version 2.0
  header.setUint16(6, 0x0800) // flags, bit 3 on = size and CRCs will be zero
  // leave compression = zero (2 bytes) until we implement compression
  header.setUint32(10, formatDOSDateTime(file.modDate))
  // leave CRC = zero (4 bytes) because we'll write it later, in the central repo
  // leave lengths = zero (2x4 bytes) because we'll write them later, in the central repo

  const encodedName = new TextEncoder().encode(file.name)
  header.setUint16(26, encodedName.length, true)
  // leave extra field length = zero (2 bytes)
  return [makeUint8Array(header), makeUint8Array(encodedName)]
}

function centralHeader(file: ZipFileDescription, offset: number, centralRecord: ArrayBuffer[]) {
  const header = makeBuffer(46)
  header.setUint32(0, repoSignature)
  header.setUint16(4, 0x1503) // UNIX version 2.1
  header.setUint16(6, 0x1400) // version 2.0
  header.setUint16(8, 0x0800) // flags, bit 3 on
  // leave compression = zero (2 bytes) until we implement compression
  header.setUint32(12, formatDOSDateTime(file.modDate))
  header.setUint32(16, file.crc, true)
  header.setUint32(20, file.size, true)
  header.setUint32(24, file.size, true)

  const encodedName = new TextEncoder().encode(file.name)
  header.setUint16(28, encodedName.length, true)
  // leave extra field length = zero (2 bytes)
  // useless disk fields = zero (4 bytes)
  // useless attributes = zero (6 bytes)
  header.setUint32(42, offset, true) // offset
  centralRecord.push(makeUint8Array(header))
  centralRecord.push(makeUint8Array(encodedName))
}

