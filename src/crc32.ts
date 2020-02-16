const Polynomial = 0xEDB88320

const byteTable = new Uint32Array(256).map((_, crc) => {
  for (let i = 0; i < 8; i++)
    crc = crc >>> 1 ^ (crc & 1) * Polynomial;
  return crc;
})

export function crc32(data: Uint8Array, init: number) {
  let crc = ~data.reduce((c, byte) => c >>> 8 ^ byteTable[c & 0xFF ^ byte], ~init)
  return crc < 0 ? crc + 0x100000000 : crc
}
