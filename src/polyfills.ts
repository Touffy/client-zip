if (!("stream" in Blob.prototype)) Object.defineProperty(Blob.prototype, "stream", {
  value(this: Blob) { return new Response(this).body }
})

if (!("setBigUint64" in DataView.prototype)) Object.defineProperty(DataView.prototype, "setBigUint64", {
  value(this: DataView, byteOffset: number, value: bigint, littleEndian?: boolean) {
    const lowWord = Number(value & 0xffffffffn)
    const highWord = Number(value >> 32n)
    this.setUint32(byteOffset + (littleEndian ? 0 : 4), lowWord, littleEndian)
    this.setUint32(byteOffset + (littleEndian ? 4 : 0), highWord, littleEndian)
  }
})

export {}
