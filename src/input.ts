import { encodeString, makeUint8Array } from "./utils.ts"

export type BufferLike = ArrayBuffer | string | ArrayBufferView | Blob
export type StreamLike = ReadableStream<Uint8Array> | AsyncIterable<BufferLike>
export type ZipFileDescription = {
  modDate: Date
  bytes: ReadableStream<Uint8Array> | Uint8Array | Promise<Uint8Array>
  crc?: number // will be computed later
  mode: number // UNIX permissions, 0o664 by default
  isFile: true
}
export type ZipFolderDescription = {
  modDate: Date
  mode: number // UNIX permissions, 0o775 by default
  isFile: false
}
export type ZipEntryDescription = ZipFileDescription | ZipFolderDescription;

/** The file name and modification date will be read from the input if it is a File or Response;
 * extra arguments can be given to override the input's metadata.
 * For other types of input, the `name` is required and `modDate` will default to *now*.
 * @param modDate should be a Date or timestamp or anything else that works in `new Date()`
 */
export function normalizeInput(input: File | Response | BufferLike | StreamLike, modDate?: any, mode?: number): ZipFileDescription;
export function normalizeInput(input: undefined, modDate?: any, mode?: number): ZipFolderDescription;
export function normalizeInput(input?: File | Response | BufferLike | StreamLike, modDate?: any, mode?: number): ZipEntryDescription {
  if (modDate !== undefined && !(modDate instanceof Date)) modDate = new Date(modDate)

  const isFile = input !== undefined

  if(!mode) {
    mode = isFile ? 0o664 : 0o775
  }

  if (input instanceof File) return {
    isFile,
    modDate: modDate || new Date(input.lastModified),
    bytes: input.stream(),
    mode
  }
  if (input instanceof Response) return {
    isFile,
    modDate: modDate || new Date(input.headers.get("Last-Modified") || Date.now()),
    bytes: input.body!,
    mode
  }

  if (modDate === undefined) modDate = new Date()
  else if (isNaN(modDate)) throw new Error("Invalid modification date.")
  if (!isFile) return { isFile, modDate, mode }
  if (typeof input === "string") return { isFile, modDate, bytes: encodeString(input), mode }
  if (input instanceof Blob) return { isFile, modDate, bytes: input.stream(), mode }
  if (input instanceof Uint8Array || input instanceof ReadableStream) return { isFile, modDate, bytes: input, mode }
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return { isFile, modDate, bytes: makeUint8Array(input), mode }
  if (Symbol.asyncIterator in input) return { isFile, modDate, bytes: ReadableFromIterator(input[Symbol.asyncIterator]()), mode }
  throw new TypeError("Unsupported input format.")
}

export function ReadableFromIterator<T extends BufferLike>(iter: AsyncIterator<T>, upstream: AsyncIterator<any> = iter) {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let pushedSize = 0
      while (controller.desiredSize! > pushedSize) {
        const next = await iter.next()
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
    },
    cancel(err) {
      upstream.throw?.(err)
    }
  })
}

export function normalizeChunk(chunk: BufferLike) {
  if (typeof chunk === "string") return encodeString(chunk)
  if (chunk instanceof Uint8Array) return chunk
  return makeUint8Array(chunk)
}
