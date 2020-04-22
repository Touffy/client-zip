import { makeBuffer } from "./utils"

export function formatDOSDateTime(date: Date) {
  let dosTime = date.getSeconds() >> 1
  dosTime |= date.getMinutes() << 5
  dosTime |= date.getHours() << 11

  let dosDate = date.getDate()
  dosDate |= (date.getMonth() + 1) << 5
  dosDate |= (date.getFullYear() - 1980) << 9

  const buffer = makeBuffer(4)
  buffer.setUint16(0, dosTime, true)
  buffer.setUint16(2, dosDate, true)
  return buffer.getUint32(0)
}
