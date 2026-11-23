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

Deno.test("downloadZip writes ZIP version 2.0 and DEFLATE entries that inflate back to the input", async () => {
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
  const data = zip.subarray(30 + specName.length, 30 + specName.length + compressedSize)
  const inflated = await new Response(new Response(data.slice()).body!.pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()
  assertEquals(new Uint8Array(inflated), zipSpec)
})

Deno.test("downloadZip announces ZIP version 2.0 only for entries whose size is known in advance", async () => {
  const stream = () => new Blob(["streamed"]).stream()
  const makeInputs = () => [
    { name: "blob", input: new Blob(["blob"]), expected: 20 },
    { name: "string", input: "string", expected: 20 },
    { name: "buffer", input: new Uint8Array(3), expected: 20 },
    { name: "empty", input: new Blob([]), expected: 20 },
    { name: "sized-stream", input: stream(), size: 8, expected: 20 },
    { name: "stream", input: stream(), expected: 45 },
    { name: "response-with-length", input: new Response("four", { headers: { "content-length": "4" } }), expected: 20 },
    { name: "response-without-length", input: new Response(stream()), expected: 45 },
    { name: "response-encoded", input: new Response("four", { headers: { "content-length": "4", "content-encoding": "gzip" } }), expected: 45 },
    { name: "folder", expected: 20 },
  ]
  for (const compress of [false, true]) {
    const inputs = makeInputs()
    const zip = new Uint8Array(await downloadZip(inputs.map(({ expected: _, ...file }) => file), { compress }).arrayBuffer())
    const view = new DataView(zip.buffer)
    let central = view.getUint32(zip.length - 6, true)
    for (const { name, expected } of inputs) {
      assertEquals(view.getUint32(central), 0x504b0102)
      const nameLength = view.getUint16(central + 28, true)
      const entryName = new TextDecoder().decode(zip.subarray(central + 46, central + 46 + nameLength))
      assertEquals(entryName.replace(/\/$/, ""), name)
      assertEquals([name, view.getUint16(central + 6, true)], [name, expected])
      const local = view.getUint32(central + 42, true)
      assertEquals([name, view.getUint16(local + 4, true)], [name, expected])
      assertEquals([name, view.getUint16(central + 10, true)], [name, compress && name !== "folder" ? 8 : 0])
      central += 46 + nameLength + view.getUint16(central + 30, true)
    }
  }
})

async function methodsOf(response: Response) {
  const zip = new Uint8Array(await response.arrayBuffer())
  const view = new DataView(zip.buffer)
  const methods: Record<string, number> = {}
  let central = view.getUint32(zip.length - 6, true)
  while (view.getUint32(central) === 0x504b0102) {
    const nameLength = view.getUint16(central + 28, true)
    const name = new TextDecoder().decode(zip.subarray(central + 46, central + 46 + nameLength))
    methods[name] = view.getUint16(central + 10, true)
    central += 46 + nameLength + view.getUint16(central + 30, true) + view.getUint16(central + 32, true)
  }
  return methods
}

Deno.test("downloadZip compresses the files whose MIME type matches the compress option", async () => {
  const methods = await methodsOf(downloadZip([
    new File(["text"], "plain.txt", { type: "text/plain" }),
    { name: "upper.csv", input: new Blob(["a,b"], { type: "TEXT/CSV" }) },
    { name: "image.png", input: new Blob([new Uint8Array(4)], { type: "image/png" }) },
    { name: "texts.bin", input: new Blob(["x"], { type: "texts/x" }) },
    { name: "data.json", input: new Response("{}", { headers: { "content-type": "application/json; charset=utf-8" } }) },
    { name: "untyped.json", input: new Response("{}", { headers: { "content-type": "" } }) },
    { name: "string.txt", input: "string" },
    { name: "buffer.bin", input: new Uint8Array(4) },
    { name: "stream.bin", input: new Blob(["stream"]).stream() },
    { name: "folder" },
  ], { compress: ["text/*", /json$/] }))
  assertEquals(methods, {
    "plain.txt": 8, "upper.csv": 8, "image.png": 0, "texts.bin": 0, "data.json": 8, "untyped.json": 0,
    "string.txt": 8, "buffer.bin": 0, "stream.bin": 0, "folder/": 0,
  })
})

Deno.test("a file's own compress property overrides the compress option", async () => {
  const files = () => [
    { name: "buffer.bin", input: new Uint8Array(4), compress: true },
    { name: "page.html", input: new Blob(["<p>"], { type: "text/html" }), compress: false },
    { name: "string.txt", input: "string" },
  ]
  assertEquals(await methodsOf(downloadZip(files(), { compress: ["text/*"] })), { "buffer.bin": 8, "page.html": 0, "string.txt": 8 })
  assertEquals(await methodsOf(downloadZip(files(), { compress: true })), { "buffer.bin": 8, "page.html": 0, "string.txt": 8 })
  assertEquals(await methodsOf(downloadZip(files())), { "buffer.bin": 8, "page.html": 0, "string.txt": 0 })
})

Deno.test("downloadZip refuses to compress a file when the archive's length was given", async () => {
  assertThrows(() => downloadZip([], { compress: ["text/*"], length: 100 }))
  await assertRejects(() => downloadZip([{ name: "a.bin", input: new Uint8Array(4), compress: true }], { length: 100 }).arrayBuffer())
})
