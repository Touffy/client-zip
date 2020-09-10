import { loadFiles } from "./zip"

export default (files: AsyncIterable<Response>) => new Response(
  ReadableFromGenerator(loadFiles(normalizeResponses(files))),
  { headers: { "Content-Type": "application/zip" } }
)

async function* normalizeResponses(inputs: AsyncIterable<Response>) {
  for await (const input of inputs) {
    const contentDisposition = input.headers.get("content-disposition")
    const filename = contentDisposition && contentDisposition.match(/;\s*filename\*?=["']?(.*?)["']?$/i)
    const urlName = filename?.[1] || new URL(input.url).pathname.split("/").pop()
    yield {
      encodedName: new TextEncoder().encode(decodeURIComponent(urlName)),
      modDate: new Date(input.headers.get("Last-Modified") || Date.now()),
      bytes: input.body
    }
  }
}

function ReadableFromGenerator(gen: AsyncGenerator<Uint8Array>) {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let pushedSize = 0
      while (controller.desiredSize > pushedSize) {
        const next = await gen.next()
        if (next.value) {
          controller.enqueue(next.value)
          pushedSize += next.value.byteLength
        }
        else {
          controller.close()
          break
        }
      }
    }
  })
}
