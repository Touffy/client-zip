import { makeUint8Array } from "./utils.js"

export type BufferLike = ArrayBuffer | string | ArrayBufferView
export type StreamLike = Blob | ReadableStream<Uint8Array> | AsyncIterable<BufferLike>
export type ZipFileDescription = {
  name: string, modDate: Date,
  data: ReadableStream<Uint8Array> | Uint8Array | Promise<Uint8Array>,
  size?: number, crc?: number // will be computed later
}

/** The file name and modification date will be read from the input if it is a File or Response;
 * extra arguments can be given to override the input's metadata.
 * For other types of input, the `name` and `modDate` are required.
 * @param name will be coerced to string, so… whatever
 * @param modDate should be a Date or timestamp or anything else that works in `new Date()`
 */
export function normalizeInput(input: File | Response | BufferLike | StreamLike, name?, modDate?): ZipFileDescription {
  if (name !== undefined) name = String(name)
  if (modDate !== undefined && !(modDate instanceof Date)) modDate = new Date(modDate)

  if (input instanceof File) return {
    name: name || input.name,
    modDate: modDate || new Date(input.lastModified),
    data: input.stream()
  }
  if (input instanceof Response) return {
    name: name || new URL(input.url).pathname.split("/").pop(),
    modDate: modDate || new Date(input.headers.get("Last-Modified")),
    data: input.body
  }

  if (!name) throw new Error("The file must have a name.")
  if (isNaN(+modDate)) throw new Error("Invalid modification date.")
  if (typeof input === "string") return { name, modDate, data: new TextEncoder().encode(input) }
  if (input instanceof Blob) return { name, modDate, data: input.stream() }
  if (input instanceof ArrayBuffer) return { name, modDate, data: makeUint8Array(input) }
  if (input instanceof Uint8Array) return { name, modDate, data: input }
  if (ArrayBuffer.isView(input)) return { name, modDate, data: makeUint8Array(input) }
  if (input instanceof ReadableStream) return { name, modDate, data: input }
  if (Symbol.asyncIterator in input) return { name, modDate, data: ReadableFromIter(input) }
  throw new TypeError("Unsupported input format.")
}

export function ReadableFromIter<T extends BufferLike>(iter: AsyncIterable<T> | AsyncIterator<T>) {
  const gen = ("next" in iter) ? iter : iter[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let pushedSize = 0
      while (controller.desiredSize > pushedSize) {
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
  if (typeof chunk === "string") return new TextEncoder().encode(chunk)
  if (chunk instanceof Uint8Array) return chunk
  return makeUint8Array(chunk)
}
