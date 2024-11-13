import { assertEquals, assertThrows } from "https://deno.land/std@0.132.0/testing/asserts.ts"
import { normalizeMetadata } from "../src/metadata.ts"

const encodedName = new TextEncoder().encode("test.txt")

/************************************** Responses **************************************/

Deno.test("normalizeMetadata needs a filename along Responses with insufficient metadata", () => {
  assertThrows(() => normalizeMetadata(new Response("four", {
    headers: { "content-disposition": "attachment" }
  })), Error, "The file must have a name.")
})

Deno.test("normalizeMetadata guesses filename from Content-Disposition", () => {
  const metadata = normalizeMetadata(new Response("four", {
    headers: { "content-disposition": "attachment; filename=test.txt; size=0" }
  }))
  assertEquals(metadata, { uncompressedSize: 0, encodedName, nameIsBuffer: false })
})

Deno.test("normalizeMetadata guesses filename from non latin Content-Disposition", () => {
  const metadata = normalizeMetadata(new Response("four", {
    headers: { "content-disposition": "attachment; filename* = UTF-8''%CF%8C%CE%BD%CE%BF%CE%BC%CE%B1%20%CE%B1%CF%81%CF%87%CE%B5%CE%AF%CE%BF%CF%85.txt" }
  }))
  assertEquals(metadata, { uncompressedSize: 0,encodedName: new TextEncoder().encode("όνομα αρχείου.txt"), nameIsBuffer: false })
})


Deno.test("normalizeMetadata guesses filename from a Response URL", () => {
  const response = Object.create(Response.prototype, {
    url: { get() { return "https://example.com/path/test.txt" } },
    headers: { get() { return new Headers() } }
  })
  const metadata = normalizeMetadata(response)
  assertEquals(metadata, { uncompressedSize: 0, encodedName, nameIsBuffer: false })
})

Deno.test("normalizeMetadata guesses filename from a Response URL with trailing slash", () => {
  const response = Object.create(Response.prototype, {
    url: { get() { return "https://example.com/path/test.txt/" } },
    headers: { get() { return new Headers() } }
  })
  const metadata = normalizeMetadata(response)
  assertEquals(metadata, { uncompressedSize: 0, encodedName, nameIsBuffer: false })
})

/**************************************   Files   **************************************/

Deno.test("normalizeMetadata reads filename and size from a File", () => {
  const metadata = normalizeMetadata(new File(["four"], "test.txt"))
  assertEquals(metadata, { uncompressedSize: 4, encodedName, nameIsBuffer: false })
})
