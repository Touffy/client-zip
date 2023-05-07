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
    headers: { "content-disposition": "attachment; filename=test.txt" }
  }))
  assertEquals(metadata, { uncompressedSize: 0, encodedName })
})

Deno.test("normalizeMetadata guesses filename from a Response URL", () => {
  const response = Object.create(Response.prototype, {
    url: { get() { return "https://example.com/path/test.txt" } },
    headers: { get() { return new Headers() } }
  })
  const metadata = normalizeMetadata(response)
  assertEquals(metadata, { uncompressedSize: 0, encodedName })
})

Deno.test("normalizeMetadata guesses filename from a Response URL with trailing slash", () => {
  const response = Object.create(Response.prototype, {
    url: { get() { return "https://example.com/path/test.txt/" } },
    headers: { get() { return new Headers() } }
  })
  const metadata = normalizeMetadata(response)
  assertEquals(metadata, { uncompressedSize: 0, encodedName })
})

/**************************************   Files   **************************************/

Deno.test("normalizeMetadata reads filename and size from a File", () => {
  const metadata = normalizeMetadata(new File(["four"], "test.txt"))
  assertEquals(metadata, { uncompressedSize: 4, encodedName })
})
