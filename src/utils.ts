export const makeBuffer = (size: number) => new DataView(new ArrayBuffer(size))
export const makeUint8Array = (thing: any) => new Uint8Array(thing.buffer || thing)
export const encodeString = (whatever: unknown) => new TextEncoder().encode(String(whatever))
