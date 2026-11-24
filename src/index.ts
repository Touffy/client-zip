import "./polyfills.ts"
import { type BufferLike, type StreamLike, normalizeInput, ReadableFromIterator } from "./input.ts"
import { type Metadata, normalizeMetadata } from "./metadata.ts"
import { loadFiles, contentLength, type ForAwaitable } from "./zip.ts"

/** The file name, modification date and size will be read from the input;
 * extra arguments can be given to override the input’s metadata. */
type InputWithMeta = File | Response | { input: File | Response, name?: any, lastModified?: any, size?: number, mode?: number, compress?: boolean }

/** Intrinsic size, but the file name must be provided and modification date can’t be guessed. */
type InputWithSizeMeta = { input: BufferLike, name: any, lastModified?: any, size?: number, mode?: number, compress?: boolean }

/** The file name must be provided ; modification date and content length can’t be guessed. */
type InputWithoutMeta = { input: StreamLike, name: any, lastModified?: any, size?: number, mode?: number, compress?: boolean }

/** Both filename and size must be provided ; input is not helpful here. */
type JustMeta = { input?: StreamLike | undefined, name: any, lastModified?: any, size: number | bigint, mode?: number }

export type Options = {
  /** If provided, the returned Response will have its `Content-Length` header set to this value.
   * It can be computed accurately with the `predictLength` function. */
  length?: number
  /** If provided, the returned Response will have its `Content-Length` header set to the result of
   * calling `predictLength` on that metadata. Overrides the `length` option. */
  metadata?: Iterable<InputWithMeta | InputWithSizeMeta | JustMeta>
  /** The ZIP *language encoding flag* will always be set when a filename was given as a string,
   * but when it is given as an ArrayView or ArrayBuffer, it depends on this option :
   * - `true`: always on (ArrayBuffers will *always* be flagged as UTF-8) — recommended,
   * - `false`: always off (ArrayBuffers will *never* be flagged as UTF-8),
   * - `undefined`: each ArrayBuffer will be tested and flagged if it is valid UTF-8. */
  buffersAreUTF8?: boolean
  /** Compress files with the DEFLATE method, using the browser's `CompressionStream("deflate-raw")`.
   * - `true`: compress every file,
   * - a RegExp: compress the files whose MIME type (parameters included) it matches,
   * - an array of strings and RegExps: compress the files whose MIME type matches any of them; a string matches
   *   the exact type or, as `"type/*"`, every subtype, ignoring case and parameters such as `;charset=utf-8`.
   *   The array is compiled into one case-insensitive RegExp.
   *   Strings count as `text/plain`; buffers and streams have no type,
   * - `false` or `undefined` (default): store every file.
   * A file's own `compress` property overrides this option.
   * The archive's length can't be predicted when files are compressed: a `compress` option that could match
   * anything is refused together with `length` or `metadata`, and files that ask for compression are stored. */
  compress?: boolean | RegExp | Array<string | RegExp>
}

/** The MIME type of an input, parameters included, or "" when it has none. */
function mimeType(input: unknown): string {
  return (input instanceof Blob ? input.type
    : input instanceof Response ? input.headers.get("content-type")
    : typeof input === "string" ? "text/plain" : "") || ""
}

const never = /(?!)/, always = /(?:)/

/** Compiles the `compress` option, once, into a single RegExp that is tested against each input's MIME type. */
function compressPattern(option: Options["compress"]): RegExp {
  if (option instanceof RegExp) return option
  if (!Array.isArray(option)) return option ? always : never
  if (!option.length) return never
  return new RegExp(option.map(pattern => `(?:${typeof pattern === "string"
    // a string matches the whole type, or every subtype as "type/*", and stops at the parameters
    ? `^${pattern.trim().replace(/[.*+?^${}()|[\]\\/]/g, c => c === "*" ? "[^;]*" : "\\" + c)}\\s*(?:;|$)`
    : pattern.source})`).join("|"), "i")
}

/** Whether a file should be compressed, from its own `compress` property, or else the compiled `compress` option. */
function shouldCompress(file: InputWithMeta | InputWithSizeMeta | InputWithoutMeta, pattern: RegExp): boolean {
  pattern.lastIndex = 0
  if (file instanceof File || file instanceof Response) return pattern.test(mimeType(file))
  if (file.input === undefined) return false
  if (typeof file.compress === "boolean") return file.compress
  return pattern.test(mimeType(file.input))
}

function normalizeArgs(file: InputWithMeta | InputWithSizeMeta | InputWithoutMeta | JustMeta) {
  return file instanceof File || file instanceof Response
    ? [[file], [file]] as const
    : [[file.input, file.name, file.size], [file.input, file.lastModified, file.mode]] as const
}

function* mapMeta(files: Iterable<InputWithMeta | InputWithSizeMeta | JustMeta>): Iterable<Metadata> {
  // @ts-ignore type inference isn't good enough for this… yet…
  // but rewriting the code to be more explicit would make it longer
  for (const file of files) yield normalizeMetadata(...normalizeArgs(file)[0])
}

function mapFiles(files: ForAwaitable<InputWithMeta | InputWithSizeMeta | InputWithoutMeta>, pattern: RegExp | undefined) {
  // @ts-ignore TypeScript really needs to catch up
  const iterator = files[Symbol.iterator in files ? Symbol.iterator : Symbol.asyncIterator]()
  return {
    async next() {
      const res = await iterator.next()
      if (res.done) return res
      const [metaArgs, dataArgs] = normalizeArgs(res.value)
      // @ts-ignore type inference isn't good enough for this… yet…
      // but rewriting the code to be more explicit would make it longer
      return { done: false, value: Object.assign(normalizeInput(...dataArgs), normalizeMetadata(...metaArgs), { deflate: !!pattern && shouldCompress(res.value, pattern) }) }
    },
    throw: iterator.throw?.bind(iterator),
    [Symbol.asyncIterator]() { return this }
  }
}

/** Given an iterable of file metadata (or equivalent),
 * @returns the exact byte length of the Zip file that would be generated by `downloadZip`. */
export const predictLength = (files: Iterable<InputWithMeta | InputWithSizeMeta | JustMeta>): number => contentLength(mapMeta(files))

export function downloadZip(files: ForAwaitable<InputWithMeta | InputWithSizeMeta | InputWithoutMeta>, options: Options = {}): Response {
  const headers: Record<string, any> = { "Content-Type": "application/zip", "Content-Disposition": "attachment" }
  const pattern = compressPattern(options.compress)
  if (pattern !== never) {
    if (options.length || options.metadata) throw new Error("The length of a compressed archive can't be predicted.")
    new CompressionStream("deflate-raw") // fail now if the browser can't compress
  }
  if (Number.isInteger(options.length) && options.length! > 0) headers["Content-Length"] = options.length
  if (options.metadata) headers["Content-Length"] = predictLength(options.metadata)
  // when the archive's length is predicted, nothing is compressed, not even files that ask for it
  const mapped = mapFiles(files, options.length || options.metadata ? undefined : pattern)
  return new Response(ReadableFromIterator(loadFiles(mapped, options), mapped), { headers })
}
