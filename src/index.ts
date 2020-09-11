import "./polyfills.ts"
import { BufferLike, StreamLike, normalizeInput, ReadableFromIter } from "./input.ts"
import { loadFiles } from "./zip.ts"

/** The file name and modification date will be read from the input;
 * extra arguments can be given to override the input's metadata. */
type InputWithMeta = File | Response | { input: File | Response, name?: any, lastModified?: any}

/** The file name must be provided with those types of input, and modification date can't be guessed. */
type InputWithoutMeta = { input: BufferLike | StreamLike, name: any, lastModified?: any }

type ForAwaitable<T> = AsyncIterable<T> | Iterable<T>

async function* normalizeFiles(files: ForAwaitable<InputWithMeta | InputWithoutMeta>) {
  for await (const file of files) {
    if (file instanceof File || file instanceof Response) yield normalizeInput(file)
    else yield normalizeInput(file.input, file.name, file.lastModified)
  }
}

export const downloadZip = (files: ForAwaitable<InputWithMeta | InputWithoutMeta>) => new Response(
  ReadableFromIter(loadFiles(normalizeFiles(files))),
  { headers: { "Content-Type": "application/zip" } }
)
