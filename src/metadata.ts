import { encodeString } from "./utils.ts"
import type { BufferLike, StreamLike } from "./input.ts"

export type Metadata = {
  encodedName: Uint8Array
  uncompressedSize?: number
}

/** The file name and modification date will be read from the input if it is a File or Response;
 * extra arguments can be given to override the input's metadata.
 * For other types of input, the `name` is required and `modDate` will default to *now*.
 * @param encodedName will be coerced to string, so… whatever
 */
export function normalizeMetadata(input?: File | Response | BufferLike | StreamLike, encodedName?: any, size?: number): Metadata {
  if (encodedName !== undefined && !(encodedName instanceof Uint8Array)) encodedName = encodeString(encodedName)

  if (input instanceof File) return {
    encodedName: fixFilename(encodedName || encodeString(input.name)),
    uncompressedSize: input.size
  }
  if (input instanceof Response) {
    const contentDisposition = input.headers.get("content-disposition")
    const filename = contentDisposition && contentDisposition.match(/;\s*filename\*?=["']?(.*?)["']?$/i)
    const urlName = filename && filename[1] || input.url && new URL(input.url).pathname.split("/").findLast(Boolean)
    const decoded = urlName && decodeURIComponent(urlName)
    // @ts-ignore allow coercion from null to zero
    const length = size || +input.headers.get('content-length')
    return { encodedName: fixFilename(encodedName || encodeString(decoded)), uncompressedSize: length }
  }
  encodedName = fixFilename(encodedName)
  if (typeof input === "string") return { encodedName, uncompressedSize: encodeString(input).length }
  if (input instanceof Blob) return { encodedName, uncompressedSize: input.size }
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return { encodedName, uncompressedSize: input.byteLength }
  // @ts-ignore
  return { encodedName, uncompressedSize: getUncompressedSize(input, size) }
}

function getUncompressedSize(input: any, size: number) {
  if (size > -1) {
    return size;
  }
  return input ? undefined : 0;
}

function fixFilename(encodedName: Uint8Array | undefined) {
  if (!encodedName || encodedName.every(c => c === 47)) throw new Error("The file must have a name.")
  // remove trailing slashes in files
  while (encodedName[encodedName.length-1] === 47) encodedName = encodedName.subarray(0, -1)
  return encodedName
}
