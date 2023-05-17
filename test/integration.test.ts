import { assertEquals } from "https://deno.land/std@0.132.0/testing/asserts.ts"
import { downloadZip } from "../src/index.ts"

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
