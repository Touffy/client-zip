declare interface Blob {
  stream(): ReadableStream<Uint8Array>
}
if (!("stream" in Blob.prototype)) Object.defineProperty(Blob.prototype, "stream", {
  value() { return new Response(this).body }
})
