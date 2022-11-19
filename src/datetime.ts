export function formatDOSDateTime(date: Date, into: DataView, offset = 0, utcDates = false) {
  let dosTime, dosDate;

  if (!utcDates) {
    dosTime = date.getSeconds() >> 1
    | date.getMinutes() << 5
    | date.getHours() << 11

    dosDate = date.getDate()
    | (date.getMonth() + 1) << 5
    | (date.getFullYear() - 1980) << 9
  } else {
    dosTime = date.getUTCSeconds() >> 1
    | date.getUTCMinutes() << 5
    | date.getUTCHours() << 11

    dosDate = date.getUTCDate()
    | (date.getUTCMonth() + 1) << 5
    | (date.getUTCFullYear() - 1980) << 9
  }

  into.setUint16(offset, dosTime, true)
  into.setUint16(offset + 2, dosDate, true)
}
