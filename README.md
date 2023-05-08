![Test](https://github.com/Touffy/client-zip/workflows/Test/badge.svg)
![Size](https://badgen.net/bundlephobia/minzip/client-zip)
![Dependencies](https://badgen.net/bundlephobia/dependency-count/client-zip)
![Types](https://badgen.net/npm/types/client-zip)

# What is `client-zip` ?

`client-zip` concatenates multiple files (e.g. from multiple HTTP requests) into a single ZIP, **in the browser**, so you can let your users download all the files in one click. It does *not* compress the files or unzip existing archives.

`client-zip` is lightweight (4.2 kB minified, 2.0 kB gzipped), dependency-free, and 40 times faster than the old JSZip.

* [Quick Start](#Quick-Start)
* [Compatibility](#Compatibility)
* [Usage](#Usage)
* [Benchmarks](#Benchmarks)
* [Known Issues](#Known-Issues)
* [Roadmap](#Roadmap)
* [Notes and F.A.Q.](#Notes)

# Quick Start

```sh
npm i client-zip@nozip64
```

(or just load the module from a CDN such as [UNPKG](https://unpkg.com/client-zip@nozip64/index.js) or [jsDelivr](https://cdn.jsdelivr.net/npm/client-zip@nozip64/index.js))

For direct usage with a ServiceWorker's `importScripts`, a [worker.js](https://unpkg.com/client-zip@nozip64/worker.js) file is also available alongside the module.

```javascript
import { downloadZip } from "https://cdn.jsdelivr.net/npm/client-zip@nozip64/index.js"

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

This will only work in modern browsers with [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) support (that means no IE at all). The code relies heavily on async iterables but may be transpiled down to support browsers from as far back as mid-2015, as long as they have Streams.

The nozip64 release targets ES2018 and is a bare ES6 module + an IIFE version optimized for ServiceWorkers.

# Usage

The module exports two functions:
```typescript
function downloadZip(files: ForAwaitable<InputTypes>, options?: Options): Response

function predictLength(metadata: Iterable<MetadataTypes>): number
```

`downloadZip` is obviously the main function and the only one exposed by the worker script. You give it an [(*async* or not) iterable a.k.a ForAwaitable](https://github.com/microsoft/TypeScript/issues/36153) list of inputs. Each input (`InputTypes`) can be:
* a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)
* a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File)
* or an object with the properties:
  - `name`: the file name ; optional if your input is a File or a Response because they have relevant metadata
  - `lastModified`: last modification date of the file (defaults to `new Date()` unless the input is a File or Response with a valid "Last-Modified" header)
  - `input`: something that contains your data; it can be a `File`, a `Blob`, a `Response`, some kind of `ArrayView` or a raw `ArrayBuffer`, a `ReadableStream<Uint8Array>` (yes, only Uint8Arrays, but most APIs give you just that type anyway), an `AsyncIterable<ArrayBuffer | ArrayView | string>`, … or just a string.

The *options* argument currently supports three properties, `length`, `metadata` (see [Content-Length prediction](#content-length-prediction)) and `useLanguageEncodingFlag` (see [Filename encoding](#filename-encoding)).

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

This iterable of metadata can be passed as the `metadata` property of `downloadZip`'s *options*, or, if you want to display the predicted size without actually creating the Zip file, to the `predictLength` function (not exposed in the worker script).

In the case of `predictLength`, you can even save the return value and pass it later to `downloadZip` as the `length` option, instead of repeating the `metadata`.

## Filename encoding
 In ZIP archives *language encoding flag* can be used to indicate that a filename is encoded in UTF-8. `client-zip` encodes filenames in UTF-8 and sets this flag by default. Some ZIP archive programs (e.g. build-in ZIP archive viewer in Windows) might not decode filenames correctly if this flag is off. However, you can turn off the *language encoding flag* feature by setting `useLanguageEncodingFlag` to `false` in the *options* if needed.

 If a filename type is `Uint8Array` then the flag is off for that file regardless of the value of `useLanguageEncodingFlag` since the encoding of the filename might not be UTF-8.
 
 # Benchmarks

*updated in may 2023*

I started this project because I wasn't impressed with what — at the time — appeared to be the only other ZIP library for browsers, [JSZip](https://stuk.github.io/jszip/). I later found other libraries, which I've included in the new benchmarks, and JSZip has improved dramatically (version 3.6 was 40 times slower vs. currently only 40% slower).

I requested Blob outputs from each lib, without compression. I measured the time until the blob was ready, on my M1 Pro. Sounds fair?

**Experiemnt 1** consists of 4 files (total 539 MB) manually added to a file input from my local filesystem, so there is no latency and the ZIP format structural overhead is insignificant.

**Experiemnt 2** is a set of 6214 small TGA files (total 119 MB). I tried to load them with a file input as before, but my browsers kept throwing errors while processing the large array of Files. So I had to switch to a different method, where the files are served over HTTP locally by nginx and *fetched* lazily. Unfortunately, that causes some atrocious latency across the board.

|                   |        | `client-zip`@1.6.0 |  fflate@0.7.4  |  zip.js@2.7.6  |  conflux@4.0.3  |  JSZip@3.10.1   |
|:------------------|--------|-------------------:|---------------:|---------------:|----------------:|----------------:|
|  **experiment 1** | Safari |     1.647 (σ=21) s | 1.792 (σ=15) s | 1.912 (σ=80) s |  1.820 (σ=16) s |  2.122 (σ=60) s |
| baseline: 1.653 s | Chrome |     2.480 (σ=41) s |  1.601 (σ=4) s | 4.251 (σ=53) s |  4.268 (σ=44) s |  3.921 (σ=15) s |
|  **experiment 2** | Safari |     2.173 (σ=11) s | 2.157 (σ=23) s | 3.158 (σ=17) s |  1.794 (σ=13) s |  2.631 (σ=27) s |
| baseline: 0.615 s | Chrome |     3.567 (σ=77) s |  3.506 (σ=9) s | 5.689 (σ=17) s |  3.174 (σ=22) s |  4.602 (σ=50) s |

The experiments were run 10 times (not counting a first run to let the JavaScript engine "warm up") for each lib and each dataset, *with the dev tools closed* (this is important, opening the dev tools has a noticeable impact on CPU and severe impact on HTTP latency). The numbers in the table are the mean time of the ten runs, with the standard deviation in parentheses.

For the baseline, I timed the `zip` process in my UNIX shell. As advertised, fflate run just as fast — in Chrome, anyway, and when there is no overhead for HTTP (experiment 1). In the same test, client-zip beats everyone else in Safari.

Conflux does particularly well with the second experiment because it is fed by a stream of inputs, whose buffer decreases the effect of latency. That is not an intrisic advantage of Conflux but I let it keep the win because it is the only library that recommends this in its README, and it illustrates how buffering several Responses ahead of time can improve performance when dealing with many small requests.

Zip.js workers were disabled because I didn't want to bother fixing the error I got from the library. Using workers on this task could only help by sacrificing lots of memory, anyway. But I suppose Zip.js really needs those workers to offset its disgraceful single-threaded performance.

It's interesting that Chrome performs so much worse than Safari with client-zip and conflux, the two libraries that rely on WHATWG Streams and (in my case) async iterables, whereas it shows better (and extremely consistent) runtimes with fflate, which uses synchronous code with callbacks. Zip.js and JSZip used to be faster in Chrome than Safari, but clearly things have changed.

In a different experiment using Deno to avoid storing very large output files, memory usage for any amount of data remained constant or close enough. My tests maxed out at 36.1 MB of RAM while processing nearly 6 GB.

Now, comparing bundle size is clearly unfair because the others do a bunch of things that my library doesn't. Here you go anyway (sizes are shown in decimal kilobytes):

|                    | `client-zip`@1.6.0 | fflate@0.7.4 | zip.js@2.7.6 | conflux@4.0.3 | JSZip@3.10.1  |
|--------------------|-------------------:|-------------:|--------------:|--------------:|--------------:|
| minified           |             4.2 kB |      29.8 kB |      162.3 kB |      198.8 kB |       94.9 kB |
| minified + gzipped |             2.0 kB |        11 kB |       57.8 kB |       56.6 kB |       27.6 kB |

The datasets I used in the new tests are not public domain, but nothing sensitive either ; I can send them if you ask.

# Known Issues

* client-zip cannot be bundled by SSR frameworks that expect it to run in Node.js too ([workaround](https://github.com/Touffy/client-zip/issues/28#issuecomment-1018033984)).
* Firefox may kill a Service Worker that is still feeding a download ([workaround](https://github.com/Touffy/client-zip/issues/46#issuecomment-1259223708)).
* Safari could not download from a Service Worker until version 15.4 (released 4 march 2022).

# Roadmap

`client-zip` does not support compression, encryption, or any extra fields and attributes, and does not produce ZIP64 files. It already meets the need that sparked its creation: combining many `fetch` responses into a one-click donwload for the end user (within a total 4GB limit), so I'm calling it a 1.0 anyway.

If you need a feature, you're very welcome to [open an issue](https://github.com/Touffy/client-zip/issues) or submit a pull request.

### extra fields

Should be straightforward to implement if needed. Maybe `client-zip` should allow extending by third-party code so those extra fields can be plug-ins instead of built into the library.

The UNIX permissions in external attributes (ignored by many readers, though) are hardcoded to 664, could be made configurable.

### ZIP64

The most obviously useful feature, ZIP64 allows the archive to contain files larger than 4GB and to exceed 4GB in total.

It is implemented in [client-zip 2](https://github.com/Touffy/client-zip/tree/master).

### compression

Limited use case. If the user is going to extract the archive just after downloading anyway, it's a waste of CPU. Implementation should be relatively easy with the new CompressionStream API.

### encryption

AES and RSA encryption could be implemented quite easily with [WebCrypto](https://www.w3.org/TR/WebCryptoAPI/). I just don't see any use case for it (but if there is one, compression would be relevant for it too).

### performance improvements

The current implementation does a fair bit of ArrayBuffer copying and allocation, much of which can be avoided with brand new (and sadly not widely supported yet) browser APIs like [`TextEncoder.encodeInto`](https://encoding.spec.whatwg.org/#dom-textencoder-encodeinto), [`TextEncoderStream`](https://encoding.spec.whatwg.org/#interface-textencoderstream), [BYOB Streams](https://streams.spec.whatwg.org/#byob-readers) and [`TransformStreams`](https://streams.spec.whatwg.org/#ts-model).

CRC-32 computation is, and will certainly remain, by far the largest performance bottleneck in client-zip. Currently, it is implemented with a version of Sarwate's standard algorithm in JavaScript. My initial experiments have shown that a version of the slice-by-8 algorithm using SIMD instructions in WebAssembly can run a bit faster, but the previous (simpler) WASM implementation is now slower than pure JavaScript.

# Notes

## A note about dates

The old DOS date/time format used by ZIP files is an unspecified "local time". Therefore, to ensure the best results for the end user, `client-zip` will use the client's own timezone (not UTC or something decided by the author), resulting in a ZIP archive that varies across different clients. If you write integration tests that expect an exact binary content, make sure you set the machine running the tests to the same timezone as the one that generated the expected content.

## How can I include folders in the archive ?

Just include the folder hierarchy in its content's filenames (e.g. `{ name: "folder/file.ext", input }` will implicitly create "folder/" and place "file.ext" in it). Forward slashes even for Windows users !
