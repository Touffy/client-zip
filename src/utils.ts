export const makeBuffer = (size: number) => new DataView(new ArrayBuffer(size))
export const makeUint8Array = (thing: any) => new Uint8Array(thing.buffer || thing)
export const clampInt32 = (n: bigint) => Math.min(0xffffffff, Number(n))
export const clampInt16 = (n: bigint) => Math.min(0xffff, Number(n))

export const parseWasm = (base64: string[]) => {
  const chunks = base64.flatMap(s => Array.from(atob(s), c => c.charCodeAt(0)))
  return new WebAssembly.Module(Uint8Array.of(...chunks))
}
