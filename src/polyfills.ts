if (!("stream" in Blob.prototype)) Object.defineProperty(Blob.prototype, "stream", {
  value() { return new Response(this).body }
})
