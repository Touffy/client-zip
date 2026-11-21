import { assertEquals, assertRejects } from "@std/assert"
import { downloadZip, predictLength } from "../src/index.ts"

const zipSpec = Deno.readFileSync("./test/APPNOTE.TXT")
const specName = new TextEncoder().encode("APPNOTE.TXT")
const specDate = new Date("2019-04-26T02:00")

Deno.test("downloadZip propagates pulling and cancellation", async (t) => {
  const thrown: unknown[] = []
  let pulled = 0
  const input: IterableIterator<{ input: Uint8Array, name: Uint8Array, lastModified: Date }> = {
    next() {
      if (pulled++) return { done: true, value: undefined }
      return { done: false, value: { input: zipSpec, name: specName, lastModified: specDate } }
    },
    throw(err: unknown) {
      thrown.push(err)
      return { done: true, value: undefined }
    },
    [Symbol.iterator]() {
      return this
    }
  }
  const response = downloadZip(input)
  const reader = response.body!.getReader()
  await t.step("it does not pull from its input until someone reads the output", () => {
    assertEquals(pulled, 0)
  })
  await t.step("it pulls lazily from the input iterable", async () => {
    for (let i = 0; i < 2; i++) await reader.read()
    assertEquals(pulled, 1)
    for (let i = 0; i < 4; i++) await reader.read()
    assertEquals(pulled, 2)
    assertEquals(thrown.length, 0)
  })
  await t.step("it cancels the input iterable when its output is cancelled", async () => {
    const error = new Error("I don't want to ZIP anymore !")
    await reader.cancel(error)
    assertEquals(thrown.length, 1)
    assertEquals(thrown[0], error)
  })
})

Deno.test("downloadZip awaits asynchronous iterator cancellation", async () => {
  let finalized = false
  async function* files() {
    try {
      yield { name: "example.txt", input: "example" }
    } finally {
      await Promise.resolve()
      finalized = true
    }
  }
  const reader = downloadZip(files()).body!.getReader()
  await reader.read()
  await reader.read()
  await assertRejects(() => reader.cancel(new Error("cancel async export")), Error, "cancel async export")
  assertEquals(finalized, true)
})

async function readTail(stream: ReadableStream<Uint8Array>, size: number) {
  const tail = new Uint8Array(size)
  let length = 0
  for await (const chunk of stream) {
    const keep = Math.min(chunk.length, size)
    tail.copyWithin(0, keep)
    tail.set(chunk.subarray(chunk.length - keep), size - keep)
    length += chunk.length
  }
  return { length, tail: new DataView(tail.buffer) }
}

Deno.test("downloadZip writes the Zip64 end records from 65535 entries", async (t) => {
  // the Zip64 end record (56 bytes), its locator (20) and the end of central directory record (22)
  const footer = 56 + 20 + 22
  for (const count of [65534, 65535, 65536]) {
    await t.step(`${count} empty entries`, async () => {
      function* entries() {
        for (let i = 0; i < count; i++) yield { name: `empty-${i}`, input: "" }
      }
      const { length, tail } = await readTail(downloadZip(entries()).body!, footer)
      assertEquals(BigInt(length), predictLength(entries()))

      const end = footer - 22
      assertEquals(tail.getUint32(end), 0x504b0506)
      assertEquals(tail.getUint16(end + 10, true), Math.min(count, 0xffff))
      if (count < 0xffff) {
        assertEquals(tail.getUint32(0) === 0x504b0606, false)
        return
      }
      assertEquals(tail.getUint32(0), 0x504b0606)
      assertEquals(tail.getBigUint64(24, true), BigInt(count))
      assertEquals(tail.getBigUint64(32, true), BigInt(count))
      assertEquals(tail.getUint32(56), 0x504b0607)
      assertEquals(tail.getBigUint64(64, true), BigInt(length - footer))
      assertEquals(tail.getBigUint64(40, true) + tail.getBigUint64(48, true), BigInt(length - footer))
    })
  }
})
