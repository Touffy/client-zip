import { assertEquals } from "https://deno.land/std/testing/asserts.ts"
import { formatDOSDateTime } from "../src/datetime.ts"
import { makeBuffer } from "../src/utils.ts"

Deno.test("the datetime encoding to local 32-bit DOS format", () => {
  const date = new Date("2020-02-15T11:24:18")
  const actual = makeBuffer(4)
  formatDOSDateTime(date, actual)
  const expected = 0x095b4f50
  assertEquals(actual.getUint32(0), expected)
})
