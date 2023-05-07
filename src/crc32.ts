export const CRC_TABLE = new Uint32Array(256);

for (let i = 0; i < 256; ++i) {
  let crc = i;
  for (let j = 0; j < 8; ++j) {
    crc = (crc >>> 1) ^ (crc & 0x01 && 0xEDB88320);
  }
  CRC_TABLE[i] = crc;
}

export function crc32(data: Uint8Array, crc = 0): number {
  crc = crc ^ -1;
  for (var i=0, l=data.length; i<l; i++) {
      crc = crc >>> 8 ^ CRC_TABLE[crc & 0xFF ^ data[i]];
  }
  return (crc ^ -1) >>> 0;
};
