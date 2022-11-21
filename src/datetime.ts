export function formatDOSDateTime(date: Date, into: DataView, offset = 0) {
  const dosTime = date.getSeconds() >> 1
  | date.getMinutes() << 5
  | date.getHours() << 11

  const dosDate = date.getDate()
  | (date.getMonth() + 1) << 5
  | (date.getFullYear() - 1980) << 9

  into.setUint16(offset, dosTime, true)
  into.setUint16(offset + 2, dosDate, true)
}
