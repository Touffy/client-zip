## 2.0.0:

* breaking: now targets ES2020 because we need BigInts, because…
* breaking (a little): client-zip now generates ZIP64 archives!
* minor: the worker IIFE version is now identical (accepts all the input types) ; might be useful with transferable blobs and streams.
* Zip64 is only used when necessary.

## 1.3.1:
* patch: the UNIX part of the external attributes was left at zero, causing some Linux setups to create files with no permissions at all ; now set to 664 (rw-rw-r)

## 1.3.0:
* minor: added a `Content-Disposition: attachment` header to the returned Response ; particularly useful when combined with a `form` action intercepted by a Service Worker because forms don't have a `download` attribute like links

## 1.2.2:
* patch: added a few missing TypeScript annotations to avoid "Member 'name' implicitly has an 'any' type." errors in strict TypeScript settings

## 1.2.1
* patch: fixed typings that made TypeScript complain when you passed an array to downloadZip

## 1.2.0
* minor: added a worker script alongside the ES module. It only accepts Responses as input.
* updated README with results from my "faster-crc" experiments

## 1.1.1
* patch: fixed DOS date/time encoding
* patch: fixed Invalid Date that was attributed to Responses with no Last-Modified header

## 1.1.0
* minor: the WebAssembly Memory is now created inside the wasm module, resulting in a module that is easier to import and a small reduction in bundle size
* typo: removed a little bit of duplicate code in normalizeInput's Response name handling

## 0.3.0
* minor: `input.lastModification` is now optional in all cases
* minor: when extracting the file name from a Request, consider first the "filename" option from the "Content-Disposition" header

## 0.2.4 More Fixed
* patch (**critical**): fixed infinite loop in a function that was trying to chunk large files for crc32

## 0.2.3 Fixed!
* patch (**critical**): computed file size was *NaN* when reading from a stream
* patch: a little mangling and refactoring again

## 0.2.2
* patch: update README with recent changes to property names

## 0.2.1
* patch: a little refactoring and tweaking of Terser options
* actually breaking but I didn't notice: renamed input property `modDate` to `lastModification`

## 0.2 more speed!
* minor: now using WebAssembly for CRC32, yielding a ~10x speed improvement over the JavaScript version
* minor: polyfill *Blob*.stream() instead of using a FileReader to process Blobs
* patch: fix typo in README

## 0.1 First commit
