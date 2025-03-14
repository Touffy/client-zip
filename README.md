![Test](https://github.com/Touffy/client-zip/workflows/Test/badge.svg)
![Size](https://badgen.net/bundlephobia/minzip/client-zip)
![Dependencies](https://badgen.net/bundlephobia/dependency-count/client-zip)
![Types](https://badgen.net/npm/types/client-zip)

# What is `client-zip` ?

`client-zip` concatenates multiple files (e.g. from multiple HTTP requests) into a single ZIP, **in the browser**, so you can let your users download all the files in one click. It does *not* compress the files or unzip existing archives.

`client-zip` is lightweight (6.4 kB minified, 2.6 kB gzipped), dependency-free, and 40 times faster than the old JSZip.

* [Quick Start](#Quick-Start)
* [Compatibility](#Compatibility)
* [Usage](#Usage)
* [Benchmarks](#Benchmarks)
* [Known Issues](#Known-Issues)
* [Roadmap](#Roadmap)
* [Notes and F.A.Q.](#Notes)

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

client-zip works in all modern browsers (and Deno) out of the box. If you bundle it with your app and try to transpile it down to lower than ES2020, it will break because it needs BigInts. [Version 1.x](https://www.npmjs.com/package/client-zip/v/nozip64) may be painfully transpiled down to as low as ES2015.

The default release of version 2 targets ES2020 and is a bare ES module + an IIFE version suitable for a ServiceWorker's `importScript`. Version 1 releases were built for ES2018.

When necessary, client-zip version 2 will generate Zip64 archives. It will always specify "ZIP version 4.5 required to unzip", even when that's not really true. The resulting files are not readable by every ZIP reader out there.

# Usage

The module exports three functions:
```typescript
function downloadZip(files: ForAwaitable<InputTypes>, options?: Options): Response

function makeZip(files: ForAwaitable<InputTypes>, options?: Options): ReadableStream

function predictLength(metadata: Iterable<MetadataTypes>): bigint
```

`downloadZip` is obviously the main function and the only one exposed by the worker script. You give it an [(*async* or not) iterable a.k.a ForAwaitable](https://github.com/microsoft/TypeScript/issues/36153) list of inputs. Each input (`InputTypes`) can be:
* a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)
* a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File)
* or an object with the properties:
  - `name`: the file name ; optional if your input is a File or a Response because they have relevant metadata
  - `lastModified`: last modification date of the file (defaults to `new Date()` unless the input is a File or Response with a valid "Last-Modified" header)
  - `input`: something that contains your data; it can be a `File`, a `Blob`, a `Response`, some kind of `ArrayView` or a raw `ArrayBuffer`, a `ReadableStream<Uint8Array>` (yes, only Uint8Arrays, but most APIs give you just that type anyway), an `AsyncIterable<ArrayBuffer | ArrayView | string>`, … or just a string.
  - `mode`: override the POSIX file mode (by default, it will be `0o664`). Should be between `0` and `0o777` — disrespect that constraint at your own risk.

The *options* argument currently supports three properties, `length`, `metadata` (see [Content-Length prediction](#content-length-prediction)) and `buffersAreUTF8` (see [Filename encoding](#filename-encoding)).

The function returns a `Response` immediately. You don't need to wait for the whole ZIP to be ready. It's up to you if you want to pipe the Response somewhere (e.g. if you are using `client-zip` inside a ServiceWorker) or let the browser buffer it all in a Blob.

Unless your list of inputs is quite small, you should prefer generators (when zipping Files or other resources that are already available) and async generators (when zipping Responses so you can `fetch` them lazily, or other resources that are generated last-minute so you don't need to store them longer than necessary) to provide the inputs to `downloadZip`.

`makeZip` is just like `downloadZip` except it returns the underlying `ReadableStream` directly, for use cases that do not involve actually downloading to the client filesystem.

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

An object with a *name* but no *input* and no *size* (not even zero) will be interpreted as an empty folder and renamed accordingly. To properly specify empty files without an *input*, set the *size* explicitly to zero (`0` or `0n`).

This iterable of metadata can be passed as the `metadata` property of `downloadZip`'s *options*, or, if you want to display the predicted size without actually creating the Zip file, to the `predictLength` function (not exposed in the worker script). Naturally, the metadata and actual data must match, and be **provided in the same order!** Otherwise, there could be inaccuracies in Zip64 lengths.

In the case of `predictLength`, you can even save the return value and pass it later to `downloadZip` as the `length` option, instead of repeating the `metadata`.

## Filename encoding

(tl;dr: set `buffersAreUTF8: true` in the *options* argument)

In ZIP archives, the *language encoding flag* indicates that a filename is encoded in UTF-8. Some ZIP archive programs (e.g. build-in ZIP archive viewer in Windows) might not decode UTF-8 filenames correctly if this flag is off.

`client-zip` always encodes **string** filenames (including filenames extracted from URLs) as UTF-8 and sets this flag for the related entries. However, `downloadZip`'s *options* include a `buffersAreUTF8` setting, affecting filenames that you supply as an **ArrayBuffer** (or ArrayView).

By default (when `buffersAreUTF8` is not set or `undefined`), each ArrayBuffer filename will be tested, and flagged only if it is valid UTF-8. It is a safe default, but a little inefficient because UTF-8 is the only thing you can get in most contexts anyway. So you may tell client-zip to skip the test by setting `buffersAreUTF8: true` ; ArrayBuffers will *always* be flagged as UTF-8 without checking.

<small>If you happen to get your filenames from a dusty API reading from an antique filesystem with non-ASCII filenames encoded in some retro 8-bit encoding and you want to keep them that way in the ZIP archive, you may set `buffersAreUTF8: false` ; ArrayBuffer filenames will *never* be flagged as UTF-8. Please beware that the stored filenames will extract correctly only with a ZIP program using the same system encoding as the source.</small>

# Benchmarks

*updated in may 2023*

*updated again in may 2023 (experiment 3)*

I started this project because I wasn't impressed with what — at the time — appeared to be the only other ZIP library for browsers, [JSZip](https://stuk.github.io/jszip/). I later found other libraries, which I've included in the new benchmarks, and JSZip has improved dramatically (version 3.6 was 40 times slower vs. currently only 40% slower).

I requested Blob outputs from each lib, without compression. I measured the time until the blob was ready, on my M1 Pro. Sounds fair?

**Experiment 1** consists of 4 files (total 539 MB) manually added to a file input from my local filesystem, so there is no latency and the ZIP format structural overhead is insignificant.

**Experiment 2** is a set of 6214 small TGA files (total 119 MB). I tried to load them with a file input as before, but my browsers kept throwing errors while processing the large array of Files. So I had to switch to a different method, where the files are served over HTTP locally by nginx and *fetched* lazily. Unfortunately, that causes some atrocious latency across the board.

**Experiment 3** is the same set of 6214 TGA files combined with very small PNG files for a total of 12 044 files (total 130 MB). This time, the files are *fetched* by a [DownloadStream](https://github.com/Touffy/dl-stream) to minimize latency.

|                   |        | `client-zip`@2.4.3 |  fflate@0.7.4  |  zip.js@2.7.14  |  conflux@4.0.3  |  JSZip@3.10.1   |
|:------------------|--------|-------------------:|---------------:|----------------:|----------------:|----------------:|
|  **experiment 1** | Safari |     1.647 (σ=21) s | 1.792 (σ=15) s |  1.912 (σ=80) s |  1.820 (σ=16) s |  2.122 (σ=60) s |
| baseline: 1.653 s | Chrome |     2.480 (σ=41) s |  1.601 (σ=4) s |  4.251 (σ=53) s |  4.268 (σ=44) s |  3.921 (σ=15) s |
|  **experiment 2** | Safari |     2.173 (σ=11) s | 2.157 (σ=23) s |  3.158 (σ=17) s |  1.794 (σ=13) s |  2.631 (σ=27) s |
| baseline: 0.615 s | Chrome |     3.567 (σ=77) s |  3.506 (σ=9) s |  5.689 (σ=17) s |  3.174 (σ=22) s |  4.602 (σ=50) s |
|  **experiment 3** | Safari |     1.768 (σ=12) s | 1.691 (σ=19) s |  3.149 (σ=45) s |  1.511 (σ=38) s |  2.703 (σ=79) s |
| baseline: 0.892 s | Chrome |     4.604 (σ=79) s | 3.972 (σ=85) s | 7.507 (σ=261) s |  3.812 (σ=80) s |  6.297 (σ=35) s |

The experiments were run 10 times (not counting a first run to let the JavaScript engine "warm up" and ensure the browser caches everything) for each lib and each dataset, *with the dev tools closed* (this is important, opening the dev tools has a noticeable impact on CPU and severe impact on HTTP latency). The numbers in the table are the mean time of the ten runs, with the standard deviation in parentheses.

For the baseline, I timed the `zip -0` process in my UNIX shell. As advertised, fflate run just as fast — in Chrome, anyway, and when there is no overhead for HTTP (experiment 1). In the same test, client-zip beats everyone else in Safari.

Conflux does particularly well in the second and third experiments thanks to its internal use of ReadableStreams, which seem to run faster than async generators.

Zip.js workers were disabled because I didn't want to bother fixing the error I got from the library. Using workers on this task could only help by sacrificing lots of memory, anyway. But I suppose Zip.js really needs those workers to offset its disgraceful single-threaded performance.

It's interesting that Chrome performs so much worse than Safari with client-zip and conflux, the two libraries that rely on WHATWG Streams and (in my case) async iterables, whereas it shows better (and extremely consistent) runtimes with fflate, which uses synchronous code with callbacks, in experiment 1. Zip.js and JSZip used to be faster in Chrome than Safari, but clearly things have changed. Experiments 2 and 3 are really taxing for Chrome.

In a different experiment using Deno to avoid storing very large output files, memory usage for any amount of data remained constant or close enough. My tests maxed out at 36.1 MB of RAM while processing nearly 6 GB.

Now, comparing bundle size is clearly unfair because the others do a bunch of things that my library doesn't. Here you go anyway (sizes are shown in decimal kilobytes):

|                    | `client-zip`@2.5.0 | fflate@0.7.4 | zip.js@2.7.14 | conflux@4.0.3 | JSZip@3.10.1  |
|--------------------|-------------------:|-------------:|--------------:|--------------:|--------------:|
| minified           |             6.4 kB |      29.8 kB |      163.2 kB |      198.8 kB |       94.9 kB |
| minified + gzipped |             2.6 kB |        11 kB |         58 kB |       56.6 kB |       27.6 kB |

The datasets I used in the new tests are not public domain, but nothing sensitive either ; I can send them if you ask.

# Known Issues

* MS Office documents must be stored using ZIP version 2.0 ; [use client-zip^1 to generate those](https://github.com/Touffy/client-zip/issues/59), you don't need client-zip^2 features for Office documents anyway.
* client-zip cannot be bundled by SSR frameworks that expect it to run server-side too ([workaround](https://github.com/Touffy/client-zip/issues/28#issuecomment-1018033984)).
* Firefox may kill a Service Worker that is still feeding a download ([workaround](https://github.com/Touffy/client-zip/issues/46#issuecomment-1259223708)).
* Safari could not download from a Service Worker until version 15.4 (released 4 march 2022).

# Roadmap

`client-zip` does not support compression, encryption, or any extra fields and attributes. It already meets the need that sparked its creation: combining many `fetch` responses into a one-click download for the end user.

**New in version 2**: it now generates Zip64 archives, which increases the limit on file size to 4 Exabytes (because of JavaScript numbers) and total size to 18 Zettabytes.
**New in version 2.2**: archive size can be predicted and used as the response's Content-Length.

If you need a feature, you're very welcome to [open an issue](https://github.com/Touffy/client-zip/issues) or submit a pull request.

### extra fields

Should be straightforward to implement if needed. Maybe `client-zip` should allow extending by third-party code so those extra fields can be plug-ins instead of built into the library.

<del>Configurable UNIX permissions in external attributes.</del> The UNIX permissions are now configurable (since 1.7.0) via the `mode` field, set by default to 664 for files, 775 for folders.

### ZIP64

### <del>ZIP64</del>

Done.

### compression

Limited use case. If the user is going to extract the archive just after downloading anyway, it's a waste of CPU. Implementation should be relatively easy with the new CompressionStream API. Incompatible with content-length prediction.

### encryption

AES and RSA encryption could have been implemented with [WebCrypto](https://www.w3.org/TR/WebCryptoAPI/). However, only the proprietary PKWARE utility supports strong encryption of file contents **and metadata**. Well-supported Zip encryption methods (even using AES) do not hide metadata, giving you questionable privacy. Therefore, **this feature is no longer planned for client-zip**.

### performance improvements

The current implementation does a fair bit of ArrayBuffer copying and allocation, much of which can be avoided with brand new (and sadly not widely supported yet) browser APIs like [`TextEncoder.encodeInto`](https://encoding.spec.whatwg.org/#dom-textencoder-encodeinto), [`TextEncoderStream`](https://encoding.spec.whatwg.org/#interface-textencoderstream), [BYOB Streams](https://streams.spec.whatwg.org/#byob-readers) and [`TransformStreams`](https://streams.spec.whatwg.org/#ts-model).

CRC-32 computation is, and will certainly remain, by far the largest performance bottleneck in client-zip. Currently, it is implemented with a version of Sarwate's standard algorithm in JavaScript. My initial experiments have shown that a version of the slice-by-8 algorithm using SIMD instructions in WebAssembly can run a bit faster, but the previous (simpler) WASM implementation is now slower than pure JavaScript.

# Notes

## A note about dates

The old DOS date/time format used by ZIP files is an unspecified "local time". Therefore, to ensure the best results for the end user, `client-zip` will use the client's own timezone (not UTC or something decided by the author), resulting in a ZIP archive that varies across different clients. If you write integration tests that expect an exact binary content, make sure you set the machine running the tests to the same timezone as the one that generated the expected content.

## How can I include folders in the archive ?

When the folder has contents, just include the folder hierarchy in its content's filenames (e.g. `{ name: "folder/file.ext", input }` will implicitly create "folder/" and place "file.ext" in it). Empty folders can be specified as `{ name: "folder/" }` (with **no size**, **no input**, and an optional lastModified property). Forward slashes even for Windows users !

Any input object that has no size and no input will be treated as a folder, and a trailing slash will be added to its filename when necessary. Conversely, any input object that has a size or input (even an empty string) will be treated as a file, and the trailing slash will be removed if present.

Usage of `predictLength` or the `metadata` option must be consistent with the actual input. For example, if `{ name: "file" }` is passed as metadata, client-zip will think it's an empty folder named "file/". If you then pass `{ input: "", name: "file" }` in the same order to `downloadZip`, it will store the contents as an empty file with no trailing slash ; therefore, the predicted length will be off by at least one.
