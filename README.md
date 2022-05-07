![Test](https://github.com/Touffy/client-zip/workflows/Test/badge.svg)
![Size](https://badgen.net/bundlephobia/minzip/client-zip)
![Dependencies](https://badgen.net/bundlephobia/dependency-count/client-zip)
![Types](https://badgen.net/npm/types/client-zip)

# What is `client-zip` ?

`client-zip` concatenates multiple files (e.g. from multiple HTTP requests) into a single ZIP, **in the browser**, so you can let your users download all the files in one click. It does *not* compress the files or unzip existing archives.

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

(or just load the module from a CDN such as [UNPKG](https://unpkg.com/client-zip/index.js) or [jsDelivr](https://cdn.jsdelivr.net/npm/client-zip/index.js))

For direct usage with a ServiceWorker's `importScripts`, a [worker.js](https://unpkg.com/client-zip/worker.js) file is also available alongside the module.

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

This will only work in modern browsers with [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) support (that means no IE at all). The code relies heavily on async iterables and, since version 2, on BigInts, so it *will not work on anything earlier than 2020*. [Version 1.x](https://www.npmjs.com/package/client-zip/v/nozip64) could be transpiled down to support browsers from as far back as mid-2015, as long as they have Streams.

SSR frameworks like Next/Nuxt won’t be able to run — or even parse — client-zip on the server-side. Please look at [this issue for help on how to dynamically include client-zip in that scenario](https://github.com/Touffy/client-zip/issues/28#issuecomment-1018033984).

The default release of version 2 targets ES2020 and is a bare ES6 module + an IIFE version optimized for ServiceWorkers. Version 1 packages were built for ES2018.

Though in itself not a feature of client-zip, streaming through a ServiceWorker is practically a must-have for large archives. Sadly, there's an old bug in Safari that made it impossible there until Technology Preview 138 (released 20 jan. 2022).

When necessary, client-zip will generate Zip64 archives. Those are not readable by every ZIP reader out there, especially with the streaming flag.

# Usage

The module exports two functions:
```typescript
function downloadZip(files: ForAwaitable<InputTypes>, options?: Options): Response

function predictLength(metadata: Iterable<MetadataTypes>): bigint
```

`downloadZip` is obviously the main function and the only one exposed by the worker script. You give it an [(*async* or not) iterable a.k.a ForAwaitable](https://github.com/microsoft/TypeScript/issues/36153) list of inputs. Each input (`InputTypes`) can be:
* a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)
* a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File)
* or an object with the properties:
  - `name`: the file name ; optional if your input is a File or a Response because they have relevant metadata
  - `lastModified`: last modification date of the file (defaults to `new Date()` unless the input is a File or Response with a valid "Last-Modified" header)
  - `input`: something that contains your data; it can be a `File`, a `Blob`, a `Response`, some kind of `ArrayView` or a raw `ArrayBuffer`, a `ReadableStream<Uint8Array>` (yes, only Uint8Arrays, but most APIs give you just that type anyway), an `AsyncIterable<ArrayBuffer | ArrayView | string>`, … or just a string.

The *options* argument currently supports two properties, `length` and `metadata` (see [Content-Length prediction](#content-length-prediction) just below).

The function returns a `Response` immediately. You don't need to wait for the whole ZIP to be ready. It's up to you if you want to pipe the Response somewhere (e.g. if you are using `client-zip` inside a ServiceWorker) or let the browser buffer it all in a Blob.

Unless your list of inputs is quite small, you should prefer generators (when zipping Files or other resources that are already available) and async generators (when zipping Responses so you can `fetch` them lazily, or other resources that are generated last-minute so you don't need to store them longer than necessary) to provide the inputs to `downloadZip`.

## Content-Length prediction

Because of client-zip's streaming design, it can't look ahead at all the files to determine how big the complete archive will be. The returned `Response` will therefore not have a "Content-Length" header, and that can be problematic.

Starting with version 1.5, if you are able to gather all the relevant metadata (file sizes and names) before calling `downloadZip`, you can get it to predict the exact size of the archive and include it as a "Content-Length" header. The metadata must be a synchronous iterable, where each item (`MetadataTypes`) can be :

* a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response), either from the actual request you will use as input, or a HEAD request (either way, the response body will not be consumed at this point)
* a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File)
* or an object with the properties:
  - `name`: the file name ; optional if your input is a File or a Response because they have relevant metadata
  - `size`: the byte length of the file ; also optional if you provide a File or a Response with a Content-Length header
  - `input`: same as what you'd pass as the actual input, except this is optional here, and passing a Stream is completely useless

If you already have Files (e.g. in a form input), it's alright to pass them as metadata too. However, if you would normally `fetch` each file from a server, or generate them dynamically, please try using a dedicated metadata endpoint or function, and transforming its response into an array of `{name, size}` objects, rather than doing all the requests or computations in advance just to get a Content-Length.

This iterable of metadata can be passed as the `metadata` property of `downloadZip`'s *options*, or, if you want to display the predicted size without actually creating the Zip file, to the `predictLength` function (not exposed in the worker script). Naturally, the metadata and actual data must match, and be **provided in the same order!** Otherwise, there could be inaccuracies in Zip64 lengths.

In the case of `predictLength`, you can even save the return value and pass it later to `downloadZip` as the `length` option, instead of repeating the `metadata`.

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

The files were served over HTTP/1.1 by nginx running on localhost, with cache enabled (not that it makes a difference). The overhead of HTTP (not network, just having to go through the layers) really shows in the dataset with 12k files.

It's interesting that Chrome performs so much worse than Safari with client-zip and conflux, the two libraries that rely on WHATWG Streams and (in my case) async iterables, whereas it shows better runtimes with fflate (slightly) and JSZip (by a lot, though it may be a fluke as I did not repeat the 2-minutes long experiment), both of which use synchronous code with callbacks.

Finally, I tried to run the experiment with 12k small files in Chrome, but it didn't finish after a few minutes so I gave up. Perhaps something to do with an inefficient handling of HTTP requests (I did disable network logging and enable network cache, but saw no impovement).

Memory usage for any amount of data (when streaming using a ServiceWorker, or, in my test case for Zip64, deno) will remain constant or close enough. My tests maxed out at 36.1 MB of RAM while processing nearly 6 GB.

Now, comparing bundle size is clearly unfair because the others do a bunch of things that my library doesn't. Here you go anyway (sizes are shown in decimal kilobytes):

|                    | `client-zip`@2.0.0 | fflate@0.7.1 | conflux@3 | JSZip@3.6 |
|--------------------|-------------------:|-------------:|----------:|----------:|
| minified           |             4.6 kB |        29 kB |    185 kB |     96 kB |
| minified + gzipped |             2.1 kB |        11 kB |     53 kB |     27 kB |

The datasets I used in the new tests are not public domain, but nothing sensitive either ; I can send them if you ask.

# Roadmap

`client-zip` does not support compression, encryption, or any extra fields and attributes. It already meets the need that sparked its creation: combining many `fetch` responses into a one-click donwload for the end user.

**New in version 2**: it now generates Zip64 archives, which increases the limit on file size to 4 Exabytes (because of JavaScript numbers) and total size to 18 Zettabytes.
**New in version 2.2**: archive size can be predicted and used as the response's Content-Length.

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

## WebAssembly and Content Security Policy

In order to load the WebAssembly module in client-zip with [Content Security Policy](https://www.w3.org/TR/CSP3/) enabled (now on by default in Chrome), you have to allow `script-src` from the origin where client-zip is fetched, with `'unsafe-wasm-eval'` (and, unfortunately, `unsafe-eval` for browsers that do not yet implement the former). Your CSP header could look like this (assuming you self-host all your scripts including client-zip) :

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-wasm-eval' 'unsafe-eval'; connect-src *;
```

The `connect-src` part defines where your page can `fetch` from (`*` means "anywhere", obviously), and that's probably how you get the data for the Zip files, so be sure to set it accordingly.

It is possible to avoid specifying all those unsafe (the word is a little melodramatic) policies, by using [SubResource Integrity](https://w3c.github.io/webappsec-subresource-integrity/) and `strict-dynamic` instead. If you have user-generated content embedded in your website’s HTML then you should already be well acquainted with the finer points of CSPs. If not, it’s too complicated to fit on this page.

## A note about dates

The old DOS date/time format used by ZIP files is an unspecified "local time". Therefore, to ensure the best results for the end user, `client-zip` will use the client's own timezone (not UTC or something decided by the author), resulting in a ZIP archive that varies across different clients. If you write integration tests that expect an exact binary content, make sure you set the machine running the tests to the same timezone as the one that generated the expected content.
