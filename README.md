# What is `client-zip` ?

`client-zip` concatenates multiple files (e.g. from multiple HTTP requests) into a single ZIP, in the browser, so you can let your users download all the files in one click.

`client-zip` is lightweight (3.2 kB minified, 1.3 kB gzipped), dependency-free, and works with native ArrayBuffers and Streams to keep a low RAM footprint.

# Quick Start

```sh
npm i client-zip
```

(or just load the module from GitHub)

```javascript
import { downloadZip } from "client-zip"

async function downloadTestZip() {
  // define what we want in the ZIP
  const code = fetch("https://raw.githubusercontent.com/Touffy/client-zip/master/src/index.ts")
  const intro = { name: "intro.txt", modDate: new Date(), input: "Hello. This is the client-zip library." }

  // get the ZIP stream in a Blob
  const blob = await downloadZip([intro, code]).blob()

  // make and click a temporary link to download the Blob
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "test.zip"
  link.click()
  link.remove()

  // in real life, don't forget to revoke your Blob URLs if you use them
}
```

# Work in progress

`client-zip` 0.1 is somewhat in the <abbr title="Proof of Concept">PoC</abbr> stage and does not yet support compression, encryption, or any extra fields and attributes, and does not produce ZIP64 files.

# Compatibility

This will only work in modern browsers with [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) support (that means no IE at all). The code relies heavily on async iterables but may be transpiled down to support browsers from as far back as mid-2015, as long as they have Streams.

The default release targets ES2018 and is a bare ES6 module.

# Usage

The module exports a single function:
```typescript
function downloadZip(files: AsyncIterable<InputTypes>): Response
```

You give it an (*async* or not) iterable list of inputs. Each input can be:
* a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)
* a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File)
* or an object with the properties:
  - `name`: the file name ; optional if your input is a File or a Response because they have relevant metadata
  - `modDate`: last modification date of the file; again, optional for Files and Responses with a valid "Last-Modified" header
  - `input`: something that contains your data; it can be a `File`, a `Blob`, a `Response`, some kind of `ArrayView` or a raw `ArrayBuffer`, a `ReadableStream<Uint8Array>` (yes, only Uint8Arrays, but most APIs give you just that type anyway), an `AsyncIterable<ArrayBuffer | ArrayView | string>`, … or just a string.

The function returns a `Response` immediately. You don't need to wait for the whole ZIP to be ready. It's up to you if you want to pipe the Response somewhere (e.g. if you are using `client-zip` inside a ServiceWroker) or let the browser buffer it all in a Blob.
