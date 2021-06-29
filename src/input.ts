import { makeUint8Array } from "./utils.ts"

export type BufferLike = ArrayBuffer | string | ArrayBufferView
export type StreamLike = Blob | ReadableStream<Uint8Array> | AsyncIterable<BufferLike>
export type ZipFileDescription = {
  encodedName: Uint8Array, utf8?: Uint8Array, modDate: Date,
  bytes: ReadableStream<Uint8Array> | Uint8Array | Promise<Uint8Array>,
  uncompressedSize?: bigint, crc?: number // will be computed later
}

/** The file name and modification date will be read from the input if it is a File or Response;
 * extra arguments can be given to override the input's metadata.
 * For other types of input, the `name` is required and `modDate` will default to *now*.
 * @param encodedName will be coerced to string, so… whatever
 * @param modDate should be a Date or timestamp or anything else that works in `new Date()`
 */
export function normalizeInput(input: File | Response | BufferLike | StreamLike, encodedName?: any, modDate?: any): ZipFileDescription {
  if (encodedName !== undefined && (!(encodedName instanceof Uint8Array))) encodedName = encodeString(encodedName)
  if (modDate !== undefined && !(modDate instanceof Date)) modDate = new Date(modDate)

  if (input instanceof File) return {
    ...utf8Name(encodedName || input.name),
    modDate: modDate || new Date(input.lastModified),
    bytes: input.stream()
  }
  if (input instanceof Response) {
    const contentDisposition = input.headers.get("content-disposition")
    const filename = contentDisposition && contentDisposition.match(/;\s*filename\*?=["']?(.*?)["']?$/i)
    const urlName = filename && filename[1] || new URL(input.url).pathname.split("/").pop()
    const decoded = urlName && decodeURIComponent(urlName)
    return {
      ...utf8Name(encodedName || decoded),
      modDate: modDate || new Date(input.headers.get("Last-Modified") || Date.now()),
      bytes: input.body!
    }
  }

  if (!encodedName || encodedName.length === 0) throw new Error("The file must have a name.")
  if (modDate === undefined) modDate = new Date()
  else if (isNaN(modDate)) throw new Error("Invalid modification date.")
  if (typeof input === "string") return { ...utf8Name(encodedName), modDate, bytes: encodeString(input) }
  if (input instanceof Blob) return { ...utf8Name(encodedName), modDate, bytes: input.stream() }
  if (input instanceof Uint8Array || input instanceof ReadableStream) return { ...utf8Name(encodedName), modDate, bytes: input }
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return { ...utf8Name(encodedName), modDate, bytes: makeUint8Array(input) }
  if (Symbol.asyncIterator in input) return { ...utf8Name(encodedName), modDate, bytes: ReadableFromIter(input) }
  throw new TypeError("Unsupported input format.")
}

export function ReadableFromIter<T extends BufferLike>(iter: AsyncIterable<T> | AsyncIterator<T>) {
  const gen = ("next" in iter) ? iter : iter[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let pushedSize = 0
      while (controller.desiredSize! > pushedSize) {
        const next = await gen.next()
        if (next.value) {
          const chunk = normalizeChunk(next.value)
          controller.enqueue(chunk)
          pushedSize += chunk.byteLength
        }
        else {
          controller.close()
          break
        }
      }
    }
  })
}

export function normalizeChunk(chunk: BufferLike) {
  if (typeof chunk === "string") return encodeString(chunk)
  if (chunk instanceof Uint8Array) return chunk
  return makeUint8Array(chunk)
}

function encodeString(whatever: unknown) {
  return new TextEncoder().encode(String(whatever))
}

function utf8Name(whatever: unknown): {encodedName: Uint8Array, utf8?: Uint8Array} {
  let name = String(whatever);
  if (whatever instanceof Uint8Array) {
    name = new TextDecoder().decode(whatever);
  }

  // the name has utf8 chars
  if (/[^\u0000-\u007f]/.test(name)) {
    return {
      utf8: encodeString(name),
      encodedName: encodeString(
        name.normalize('NFD') // normalize => decomposes combined graphemes into the combination of simple ones
            .replace(/[^\x00-\x7F]/g, "") // remove all non ascii char
      )
    }
  }
  return {encodedName: encodeString(name)}
}