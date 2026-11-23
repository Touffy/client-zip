import { assertEquals, assertRejects, assertThrows } from "@std/assert"
import { downloadZip } from "../src/index.ts"

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

Deno.test("downloadZip refuses to predict the length of a compressed archive", () => {
  assertThrows(() => downloadZip([], { compress: true, metadata: [] }))
  assertThrows(() => downloadZip([], { compress: true, length: 100 }))
})

Deno.test("downloadZip writes DEFLATE entries that inflate back to the input", async () => {
  const zip = new Uint8Array(await downloadZip([{ input: zipSpec, name: specName, lastModified: specDate }], { compress: true }).arrayBuffer())
  const view = new DataView(zip.buffer)
  assertEquals(view.getUint16(4, true), 20) // local header: version needed
  assertEquals(view.getUint16(8, true), 8) // local header: DEFLATE
  const central = zip.length - 22 - 46 - specName.length
  assertEquals(view.getUint32(central), 0x504b0102)
  assertEquals(view.getUint16(central + 6, true), 20)
  assertEquals(view.getUint16(central + 10, true), 8)
  const compressedSize = view.getUint32(central + 20, true)
  assertEquals(view.getUint32(central + 24, true), zipSpec.length)
  assertEquals(view.getUint32(zip.length - 6, true), central) // central directory offset
  const data = zip.subarray(30 + specName.length, 30 + specName.length + compressedSize)
  const inflated = await new Response(new Response(data.slice()).body!.pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()
  assertEquals(new Uint8Array(inflated), zipSpec)
})
