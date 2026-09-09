import { assertEquals } from "https://deno.land/std@0.132.0/testing/asserts.ts"
import { downloadZip, predictLength } from "../src/index.ts"

const zipSpec = Deno.readFileSync("./test/APPNOTE.TXT")
const specName = new TextEncoder().encode("APPNOTE.TXT")
const specDate = new Date("2019-04-26T02:00")

Deno.test("downloadZip propagates pulling and cancellation", async (t) => {
  const thrown: any[] = []
  let pulled = 0
  const input: IterableIterator<{ input: Uint8Array, name: Uint8Array, lastModified: Date }> = {
    next() {
      if (pulled++) return { done: true, value: undefined }
      return { done: false, value: { input: zipSpec, name: specName, lastModified: specDate } }
    },
    throw(err: any) {
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

Deno.test("ZIP64 preserves central-directory entry counts at the 16-bit boundary", async (t) => {
  for (const count of [65534, 65535, 65536]) {
    await t.step(`${count} empty entries`, async () => {
      function* entries() {
        for (let i = 0; i < count; i++) yield { name: `empty-${i}`, input: "" }
      }
      const bytes = await downloadZip(entries()).arrayBuffer()
      assertEquals(BigInt(bytes.byteLength), predictLength(entries()))
      const view = new DataView(bytes), end = bytes.byteLength - 22
      assertEquals(view.getUint32(end), 0x504b0506)
      assertEquals(view.getUint16(end + 10, true), Math.min(count, 65535))
      if (count >= 65535) {
        const zip64 = end - 76
        assertEquals(view.getUint32(zip64), 0x504b0606)
        assertEquals(view.getBigUint64(zip64 + 24, true), BigInt(count))
        assertEquals(view.getBigUint64(zip64 + 32, true), BigInt(count))
        assertEquals(view.getUint32(zip64 + 56), 0x504b0607)
        assertEquals(view.getBigUint64(zip64 + 64, true), BigInt(zip64))
        assertEquals(view.getBigUint64(zip64 + 40, true) + view.getBigUint64(zip64 + 48, true), BigInt(zip64))
      }
    })
  }
})
