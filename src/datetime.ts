import { makeBuffer } from "./utils"

export function formatDOSDateTime(date: Date) {
  let dosTime = date.getUTCSeconds() >> 1
  dosTime |= date.getUTCMinutes() << 5
  dosTime |= date.getUTCHours() << 11

  let dosDate = date.getUTCDate()
  dosDate |= (date.getUTCMonth() + 1) << 5
  dosDate |= (date.getUTCFullYear() - 1980) << 9

  const buffer = makeBuffer(4)
  buffer.setUint16(2, dosTime)
  buffer.setUint16(0, dosDate)
  return buffer.getUint32(0)
}
