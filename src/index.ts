import "./polyfills"
import { BufferLike, StreamLike, normalizeInput, ReadableFromIter } from "./input"
import { loadFiles } from "./zip"

/** The file name and modification date will be read from the input;
 * extra arguments can be given to override the input's metadata. */
type InputWithMeta = File | Response | { input: File | Response, name?, lastModified?}

/** The file name and modification must be provided with those types of input. */
type InputWithoutMeta = { input: BufferLike | StreamLike, name, lastModified }

async function* normalizeFiles(files: AsyncIterable<InputWithMeta | InputWithoutMeta>) {
  for await (const file of files) {
    if (file instanceof File || file instanceof Response) yield normalizeInput(file)
    else yield normalizeInput(file.input, file.name, file.lastModified)
  }
}

export const downloadZip = (files: AsyncIterable<InputWithMeta | InputWithoutMeta>) => new Response(
  ReadableFromIter(loadFiles(normalizeFiles(files))),
  { headers: { "Content-Type": "application/zip" } }
)
