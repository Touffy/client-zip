export const makeBuffer = (size: number) => new DataView(new ArrayBuffer(size))
export const makeUint8Array = thing => new Uint8Array(thing.buffer || thing)
