import { encodeString, makeUint8Array } from "./utils.ts"
import type { BufferLike, StreamLike } from "./input.ts"

export type Metadata = {
  encodedName: Uint8Array
  uncompressedSize?: bigint
  /** keep track of whether the filename was supplied as a Buffer-like object */
  nameIsBuffer: boolean
}

/** The file name and modification date will be read from the input if it is a File or Response;
 * extra arguments can be given to override the input's metadata.
 * For other types of input, the `name` is required and `modDate` will default to *now*.
 * @param name will be coerced, so… whatever, but Uint8Array or string would be nice
 */
export function normalizeMetadata(input?: File | Response | BufferLike | StreamLike, name?: unknown, size?: number | bigint): Metadata {
  let [encodedName, nameIsBuffer] = normalizeName(name)

  if (input instanceof File) return {
    encodedName: fixFilename(encodedName || encodeString(input.name)), uncompressedSize: BigInt(input.size), nameIsBuffer
  }
  if (input instanceof Response) {
    const contentDisposition = input.headers.get("content-disposition")
    const filename = contentDisposition && contentDisposition.match(/;\s*filename\*?=["']?(.*?)["']?$/i)
    const urlName = filename && filename[1] || input.url && new URL(input.url).pathname.split("/").findLast(Boolean)
    const decoded = urlName && decodeURIComponent(urlName)
    // @ts-ignore allow coercion from null to zero
    const length = size || +input.headers.get('content-length')
    return { encodedName: fixFilename(encodedName || encodeString(decoded)), uncompressedSize: BigInt(length), nameIsBuffer }
  }
  encodedName = fixFilename(encodedName, input !== undefined || size !== undefined)
  if (typeof input === "string") return { encodedName, uncompressedSize: BigInt(encodeString(input).length), nameIsBuffer }
  if (input instanceof Blob) return { encodedName, uncompressedSize: BigInt(input.size), nameIsBuffer }
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return { encodedName, uncompressedSize: BigInt(input.byteLength), nameIsBuffer }
  // @ts-ignore
  return { encodedName, uncompressedSize: getUncompressedSize(input, size), nameIsBuffer }
}

function getUncompressedSize(input: any, size: number | bigint) {
  if (size > -1) {
    return BigInt(size);
  }
  return input ? undefined : 0n;
}

function normalizeName(name: unknown): [encodedName: Uint8Array | undefined, nameIsBuffer: boolean] {
  if (!name) return [undefined, false]
  if (name instanceof Uint8Array) return [name, true]
  if (ArrayBuffer.isView(name) || name instanceof ArrayBuffer) return [makeUint8Array(name), true]
  return [encodeString(name), false]
}

function fixFilename(encodedName: Uint8Array | undefined, isFile = true) {
  if (!encodedName || encodedName.every(c => c === 47)) throw new Error("The file must have a name.")
  // remove trailing slashes in files
  if (isFile) while (encodedName[encodedName.length-1] === 47) encodedName = encodedName.subarray(0, -1)
  else // add a trailing slash to folders
    if (encodedName[encodedName.length-1] !== 47) encodedName = new Uint8Array([...encodedName, 47])
  return encodedName
}
