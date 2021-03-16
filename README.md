![Test](https://github.com/Touffy/client-zip/workflows/Test/badge.svg)
![Size](https://badgen.net/bundlephobia/minzip/client-zip)
![Dependencies](https://badgen.net/bundlephobia/dependency-count/client-zip)
![Types](https://badgen.net/npm/types/client-zip)

# What is `client-zip` ?

`client-zip` concatenates multiple files (e.g. from multiple HTTP requests) into a single ZIP, in the browser, so you can let your users download all the files in one click. It does *not* compress the files or unzip existing archives.

`client-zip` is lightweight (4.6 kB minified, 2.1 kB gzipped), dependency-free, and 40 times faster than JSZip.

# Quick Start

```sh
npm i client-zip
```

or just load the module from your favorite CDN, like https://cdn.jsdelivr.net/npm/client-zip/index.js

For direct usage with a ServiceWorker's `importScripts`, a [worker.js](https://cdn.jsdelivr.net/npm/client-zip/worker.js) file is also available alongside the module.

**Warning:** this example is fine for a small archive (under 500 MiB, as many browsers don't allow larger Blobs anyway). For larger files, please have a look at the [Service Worker streaming demo](https://touffy.me/client-zip/demo/worker).

```javascript
import { downloadZip } from "https://cdn.jsdelivr.net/npm/client-zip/index.js"

async function downloadTestZip() {
  // define what we want in the ZIP
  const code = await fetch("https://raw.githubusercontent.com/Touffy/client-zip/master/src/index.ts")
  const intro = { name: "intro.txt", lastModified: new Date(), input: "Hello. This is the client-zip library." }

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

# Compatibility

This will only work in modern browsers with [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) support (that means no IE at all). The code relies heavily on async iterables and, since version 2, on BigInts, so it *will not work on anything earlier than 2020*. [Version 1.x](https://www.npmjs.com/package/client-zip/v/1.3.1) could be transpiled down to support browsers from as far back as mid-2015, as long as they have Streams.

The default release of version 2 targets ES2020 and is a bare ES6 module + an IIFE version optimized for ServiceWorkers. Version 1 packages were built for ES2018.

Though in itself not a feature of client-zip, streaming through a ServiceWorker is practically a must-have for large archives. Sadly, there's an old bug in Safari that makes it impossible there.

When necessary, client-zip will generate Zip64 archives. Those are not readable by every ZIP reader out there, especially with the streaming flag.

# Usage

The module exports (and the worker script globally defines) a single function:
```typescript
function downloadZip(files: ForAwaitable<InputTypes>): Response
```

You give it an [(*async* or not) iterable a.k.a ForAwaitable](https://github.com/microsoft/TypeScript/issues/36153) list of inputs. Each input can be:
* a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)
* a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File)
* or an object with the properties:
  - `name`: the file name ; optional if your input is a File or a Response because they have relevant metadata
  - `lastModified`: last modification date of the file (defaults to `new Date()` unless the input is a File or Response with a valid "Last-Modified" header)
  - `input`: something that contains your data; it can be a `File`, a `Blob`, a `Response`, some kind of `ArrayView` or a raw `ArrayBuffer`, a `ReadableStream<Uint8Array>` (yes, only Uint8Arrays, but most APIs give you just that type anyway), an `AsyncIterable<ArrayBuffer | ArrayView | string>`, … or just a string.

The function returns a `Response` immediately. You don't need to wait for the whole ZIP to be ready. It's up to you if you want to pipe the Response somewhere (e.g. if you are using `client-zip` inside a ServiceWorker) or let the browser buffer it all in a Blob.

Unless your list of inputs is quite small, you should prefer generators (when zipping Files or other resources that are already available) and async generators (when zipping Responses so you can `fetch` them lazily, or other resources that are generated last-minute so you don't need to store them longer than necessary) to provide the inputs to `downloadZip`.

# Comparison with JSZip

I started this project because I wasn't impressed with what appears to be the only other ZIP library for browsers, [JSZip](https://stuk.github.io/jszip/). The JSZip website acknowledges its performance limitations, but now we can actually quantify them.

I requested Blob outputs from both JSZip and `client-zip`, and neither is doing compression. I measured the time until the blob was ready, in Safari on my MacBook Pro. Sounds fair?

|                       | baseline* | `client-zip`@1.0.0 |    JSZip@3.2.2   |
|-----------------------|----------:|-------------------:|-----------------:|
| zip 7 files (48.3 MB) |      5 ms |       360 ms (±10) | 14 686 ms (±102) |

The experiment was run 11 times for each lib with a few seconds of rest between each run, with the same files: 5 PNGs, a text file and an ugly 40 MB PDF. The first run was a little longer for both and not counted in the aggregate. The other ten runs were quite consistent. I am no statistician but it looks very much like client-zip is **over 40 times faster** than JSZip 😜

*For the baseline, I timed the `zip` process in my UNIX shell — clearly there is much room for improvement.

Memory usage for any amount of data (when streaming using a ServiceWorker, or, in my test case, deno) will remain constant or close enough. My tests maxed out at 36.1 of RAM while processing nearly 6 GB.

Now, comparing bundle size is clearly unfair because JSZip does a bunch of things that my library doesn't. Here you go anyway (sizes are shown in decimal kilobytes):

|                    |  `client-zip`@1.0.0  |  JSZip |
|--------------------|---------------------:|-------:|
| bundle size        |  11 kB (33× smaller) | 366 kB |
| minified           | 3.8 kB (25× smaller) |  96 kB |
| minified + gzipped | 1.7 kB (16× smaller) |  27 kB |

# Roadmap

`client-zip` does not support compression, encryption, or any extra fields and attributes. It already meets the need that sparked its creation: combining many `fetch` responses into a one-click donwload for the end user.

**New in version 2**: it now generates Zip64 archives, which increases the limit on file size to 4 Exabytes (because of JavaScript numbers) and total size to 18 Zettabytes.

If you need a feature, you're very welcome to [open an issue](https://github.com/Touffy/client-zip/issues) or submit a pull request.

### extra fields

Should be straightforward to implement if needed. Maybe `client-zip` should allow extending by third-party code so those extra fields can be plug-ins instead of built into the library.

The UNIX permissions in external attributes (ignored by many readers, though) are hardcoded to 664, could be made configurable.

### <del>ZIP64</del>

Done.

### compression

Limited use case. If the user is going to extract the archive just after downloading anyway, it's a waste of CPU. Implementation would involve WebAssembly modules for ZLIB and other possible algorithms, which are more complex than CRC32 (currently the only WebAssembly module in this library).

### encryption

AES and RSA encryption could be implemented quite easily with [WebCrypto](https://www.w3.org/TR/WebCryptoAPI/). I just don't see any use case for it (but if there is one, compression would be relevant for it too).

### performance improvements

The current implementation does a fair bit of ArrayBuffer copying and allocation, much of which can be avoided with brand new (and sadly not widely supported yet) browser APIs like [`TextEncoder.encodeInto`](https://encoding.spec.whatwg.org/#dom-textencoder-encodeinto), [`TextEncoderStream`](https://encoding.spec.whatwg.org/#interface-textencoderstream), [BYOB Streams](https://streams.spec.whatwg.org/#byob-readers) and [`TransformStreams`](https://streams.spec.whatwg.org/#ts-model).

CRC-32 computation is, and will certainly remain, by far the largest performance bottleneck in client-zip. Currently, it is implemented with a version of Sarwate's standard algorithm in WebAssmebly. My initial experiments have shown that a naive version of the slice-by-8 algorithm runs no faster than that. I expect that slice-by-8 can ultimately quadruple the processing speed, but only if it takes advantage of the SIMD instructions in WebAssembly which, right now, are at best experimentally supported in browsers. Still, the performance gain is significant enough for client-zip that I would ship it along with the current implementation (as a fallback when SIMD is not supported).

## A note about dates

The old DOS date/time format used by ZIP files is an unspecified "local time". Therefore, to ensure the best results for the end user, `client-zip` will use the client's own timezone (not UTC or something decided by the author), resulting in a ZIP archive that varies across different clients. If you write integration tests that expect an exact binary content, make sure you set the machine running the tests to the same timezone as the one that generated the expected content.
