import type { Options } from "./index.ts"

/** The MIME type of an input, parameters included, or "" when it has none. */
export function mimeType(input: unknown): string {
  return (input instanceof Blob ? input.type
    : input instanceof Response ? input.headers.get("content-type")
    : typeof input === "string" ? "text/plain" : "") || ""
}

export const never = /(?!)/, always = /(?:)/

/** Compiles the `compress` option, once, into a single RegExp that is tested against each input's MIME type. */
export function compressPattern(option: Options["compress"]): RegExp {
  if (option instanceof RegExp) return option
  if (!Array.isArray(option)) return option ? always : never
  if (!option.length) return never
  return new RegExp(option.map(pattern => `(?:${typeof pattern === "string"
    // a string matches the whole type, or every subtype as "type/*", and stops at the parameters
    ? `^${pattern.trim().replace(/[.*+?^${}()|[\]\\/]/g, c => c === "*" ? "[^;]*" : "\\" + c)}\\s*(?:;|$)`
    : pattern.source})`).join("|"), "i")
}

/** Whether a file should be compressed, from its own `compress` property, or else the compiled `compress` option. */
export function shouldCompress(file: File | Response | { input?: unknown, compress?: boolean }, pattern: RegExp): boolean {
  pattern.lastIndex = 0
  if (file instanceof File || file instanceof Response) return pattern.test(mimeType(file))
  if (file.input === undefined) return false
  if (typeof file.compress === "boolean") return file.compress
  return pattern.test(mimeType(file.input))
}
