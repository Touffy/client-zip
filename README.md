![Test](https://github.com/Touffy/client-zip/workflows/Test/badge.svg)
![Size](https://badgen.net/bundlephobia/minzip/client-zip)
![Dependencies](https://badgen.net/bundlephobia/dependency-count/client-zip)
![Types](https://badgen.net/npm/types/client-zip)

# What is `client-zip` ?

`client-zip` concatenates multiple files (e.g. from multiple HTTP requests) into a single ZIP, in the browser, so you can let your users download all the files in one click. It does *not* compress the files or unzip existing archives.

`client-zip` is lightweight (4.6 kB minified, 2.1 kB gzipped), dependency-free, and 40 times faster than JSZip.

* [Quick Start](#Quick-Start)
* [Compatibility](#Compatibility)
* [Usage](#Usage)
* [Benchmarks](#Benchmarks)
* [Roadmap](#Roadmap)

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

The module exports (and the worker script globally defines) this function:
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

### Setting up vector processing for CRC32

There is a second export from the module:
```typescript
function useSimd(url?: string | URL): Promise<void>
```

**Warning**: it may reject! You should catch errors, and log them in dev mode until you fix the URL or hosting configuration.

When you call that function, it will feature test for SIMD instructions in WebAssembly, and if that succeeds, it will attempt to replace the CRC32 module with another one that's almost 30% faster (in Deno, at least), for all current and future uses of `downloadZip`.

You may call `useSimd` at any point (but preferably early and only once). By default it will look for a file named "crc32x4.wasm" in the same location as `import.meta.url`, which works when loading the library from a CDN but not necessarily if you bundle the library code into your app or "vendor" script. That's why you can pass a URL argument to `useSimd` (it will fetch the WASM from there instead ; depending on your setup you might want to copy the file to some static storage, or point to a CDN).

The IIFE worker script does *not* expose `useSimd` ; instead it calls it immediately with no argument. So if you host "worker.js", make sure "crc32x4.wasm" is served right next to it.

# Benchmarks

I started this project because I wasn't impressed with what appeared to be the only other ZIP library for browsers, [JSZip](https://stuk.github.io/jszip/). The JSZip website acknowledges its performance limitations, but now we can actually quantify them. I later found other libraries, which I've included in the new benchmarks.

I requested Blob outputs from each lib, without compression. I measured the time until the blob was ready, in Safari on my MacBook Pro. Sounds fair?

|                                           | baseline* | `client-zip`@2.0.0 | fflate@0.7.1 | conflux@3 | JSZip@3.6  |
|-------------------------------------------|----------:|-------------------:|-------------:|----------:|-----------:|
| 48.3 MB with 7 files                      |      5 ms |       360 ms (±10) |        ? |       ? | 14 686 ms (±102) |
| 310.6 MB with 37 photos and a short video |  1 559 ms |           2 527 ms |     2 621 ms |  2 934 ms | 126 205 ms |
| same 310.6 MB dataset but in Chrome       |  1 559 ms |           4 328 ms |     2 244 ms |  4 816 ms | 106 018 ms |
| 137.3 MB with 12 212 small TGA graphics   |  1 954 ms |          18 190 ms |    16 183 ms | 17 831 ms | too long ! |
| same 137.3 MB dataset in Chrome           |  1 954 ms |        too long ! |   too long ! | too long ! | too long ! |

The experiments were run about 10 times for each lib and each dataset with a few seconds of rest between each run, except JSZip for all but the first experiment because I did not have the patience. The number in the table is the median. I am no statistician but (based on the first line, where I have stable measurements for both) it looks very much like client-zip is **over 40 times faster** than JSZip 😜

*For the baseline, I timed the `zip` process in my UNIX shell — clearly there is much room for improvement.

The files were served over HTTP by nginx running on localhost, with cache enabled (not that it makes a difference).

It's interesting that Chrome performs so much worse than Safari with client-zip and conflux, the two libraries that rely on WHATWG Streams and (in my case) async iterables, whereas it shows better runtimes with fflate (slightly) and JSZip (by a lot, though it may be a fluke as I did not repeat the experiment), both of which use synchronous code with callbacks. Shame on you, Chrome.

Also of note, using the SIMD-enabled CRC32 implementation in Chrome did not improve the overall performance of client-zip, suggesting that Chrome creates a bottleneck somewhere else.

Finally, I tried to run the experiment with 12k small files in Chrome, but it was extremely slow. Perhaps something to do with an inefficient handling of so many HTTP requests (I did disable network logging and enable cache, but saw no impovement).

Memory usage for any amount of data (when streaming using a ServiceWorker, or, in my test case for Zip64, deno) will remain constant or close enough. My tests maxed out at 36.1 MB of RAM while processing nearly 6 GB.

Now, comparing bundle size is clearly unfair because the others do a bunch of things that my library doesn't. Here you go anyway (sizes are shown in decimal kilobytes):

|                    | `client-zip`@2.1.0 | fflate@0.7.1 | conflux@3 | JSZip@3.6 |
|--------------------|-------------------:|-------------:|----------:|----------:|
| minified           |             5.0 kB |        29 kB |    185 kB |     96 kB |
| minified + gzipped |             2.5 kB |        11 kB |     53 kB |     27 kB |

The datasets I used in the new tests are not public domain, but nothing sensitive either ; I can send them if you ask.

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
