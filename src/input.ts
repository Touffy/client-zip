import { encodeString, makeUint8Array } from "./utils.ts"

export type BufferLike = ArrayBuffer | string | ArrayBufferView | Blob
export type StreamLike = ReadableStream<Uint8Array> | AsyncIterable<BufferLike>
export type ZipFileDescription = {
  modDate: Date
  bytes: ReadableStream<Uint8Array> | Uint8Array | Promise<Uint8Array>
  crc?: number // will be computed later
}

/** The file name and modification date will be read from the input if it is a File or Response;
 * extra arguments can be given to override the input's metadata.
 * For other types of input, the `name` is required and `modDate` will default to *now*.
 * @param encodedName will be coerced to string, so… whatever
 * @param modDate should be a Date or timestamp or anything else that works in `new Date()`
 */
export function normalizeInput(input: File | Response | BufferLike | StreamLike, modDate?: any): ZipFileDescription {
  if (modDate !== undefined && !(modDate instanceof Date)) modDate = new Date(modDate)

  if (input instanceof File) return {
    modDate: modDate || new Date(input.lastModified),
    bytes: input.stream()
  }
  if (input instanceof Response) return {
    modDate: modDate || new Date(input.headers.get("Last-Modified") || Date.now()),
    bytes: input.body!
  }

  if (modDate === undefined) modDate = new Date()
  else if (isNaN(modDate)) throw new Error("Invalid modification date.")
  if (typeof input === "string") return { modDate, bytes: encodeString(input) }
  if (input instanceof Blob) return { modDate, bytes: input.stream() }
  if (input instanceof Uint8Array || input instanceof ReadableStream) return { modDate, bytes: input }
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return { modDate, bytes: makeUint8Array(input) }
  if (Symbol.asyncIterator in input) return { modDate, bytes: ReadableFromIter(input) }
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
