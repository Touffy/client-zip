import { assertEquals, assertStrictEquals } from "@std/assert"
import { mimeType, compressPattern, shouldCompress, never, always } from "../src/compress.ts"

Deno.test("mimeType reads the type of Files, Blobs and Responses, and treats strings as text", () => {
  assertEquals(mimeType(new File([], "a.txt", { type: "text/plain" })), "text/plain")
  assertEquals(mimeType(new Blob([], { type: "image/png" })), "image/png")
  assertEquals(mimeType(new Response("", { headers: { "content-type": "application/json; charset=utf-8" } })), "application/json; charset=utf-8")
  assertEquals(mimeType("text"), "text/plain")
})

Deno.test("mimeType returns an empty string for inputs without a type", () => {
  assertEquals(mimeType(new Blob([])), "")
  assertEquals(mimeType(new Response(new Blob([]).stream())), "")
  assertEquals(mimeType(new Uint8Array(1)), "")
  assertEquals(mimeType(new Blob([]).stream()), "")
  assertEquals(mimeType(undefined), "")
})

Deno.test("compressPattern turns booleans into RegExps that match everything or nothing", () => {
  assertStrictEquals(compressPattern(true), always)
  assertStrictEquals(compressPattern(false), never)
  assertStrictEquals(compressPattern(undefined), never)
  assertStrictEquals(compressPattern([]), never)
  assertEquals(always.test(""), true)
  assertEquals(never.test(""), false)
  assertEquals(never.test("text/plain"), false)
})

Deno.test("compressPattern uses a single RegExp as given", () => {
  const pattern = /charset=utf-8/
  assertStrictEquals(compressPattern(pattern), pattern)
})

Deno.test("compressPattern matches strings against the whole type, ignoring case and parameters", () => {
  const pattern = compressPattern(["application/json", "image/svg+xml"])
  assertEquals(pattern.test("application/json"), true)
  assertEquals(pattern.test("Application/JSON; charset=utf-8"), true)
  assertEquals(pattern.test("application/json5"), false)
  assertEquals(pattern.test("x-application/json"), false)
  assertEquals(pattern.test("image/svg+xml"), true)
  assertEquals(pattern.test("image/svgxml"), false)
  assertEquals(pattern.test(""), false)
})

Deno.test("compressPattern matches every subtype for \"type/*\"", () => {
  const pattern = compressPattern(["text/*"])
  assertEquals(pattern.test("text/plain"), true)
  assertEquals(pattern.test("text/csv;charset=utf-8"), true)
  assertEquals(pattern.test("texts/plain"), false)
  assertEquals(pattern.test("image/png"), false)
})

Deno.test("compressPattern joins strings and RegExps into one RegExp", () => {
  const pattern = compressPattern(["text/*", /json/])
  assertEquals(pattern.test("text/html"), true)
  assertEquals(pattern.test("application/ld+json"), true)
  assertEquals(pattern.test("image/png"), false)
})

Deno.test("shouldCompress prefers a file's own compress property", () => {
  const bytes = new Uint8Array(1)
  assertEquals(shouldCompress({ input: bytes, compress: true }, never), true)
  assertEquals(shouldCompress({ input: "text", compress: false }, always), false)
  assertEquals(shouldCompress({ input: bytes }, always), true)
  assertEquals(shouldCompress({ input: bytes }, compressPattern(["text/*"])), false)
  assertEquals(shouldCompress({ input: "text" }, compressPattern(["text/*"])), true)
  assertEquals(shouldCompress(new File([], "a.txt", { type: "text/plain" }), compressPattern(["text/*"])), true)
})

Deno.test("shouldCompress never compresses entries without input", () => {
  assertEquals(shouldCompress({ input: undefined, compress: true }, always), false)
})

Deno.test("shouldCompress gives the same answer every time with a global RegExp", () => {
  const pattern = compressPattern(/text/g)
  assertEquals(shouldCompress({ input: "a" }, pattern), true)
  assertEquals(shouldCompress({ input: "b" }, pattern), true)
})
