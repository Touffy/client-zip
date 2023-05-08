## 1.6.2:

* new: filenames can be flagged as UTF-8 using the EFS bit in the file header flags
  - this is configurable with the new `buffersAreUTF8` option
* and it should help the Windows Zip utility read non-ASCII filenames correctly

## 1.6.1:

* bugfix: cancelling the output stream will now cause an error in the source iterator

## 1.6.0:

Backported most improvements from version 2 :

* minor: JavaScript CRC32 is now faster than WebAssembly.
* new: added type and exports to package.json so client-zip can run in Node.js.
* bugfix: remove trailing slashes from file names.
* fixed filename extraction from a Response when its URL has a trailing slash.
* fixed content-length prediction when some files have a length of zero (previously, this threw an error).

## 1.5.1:

* fixed typings (last version incorrectly excluded ArrayBuffers, Blobs and strings as valid `input` types)

## 1.5.0:

* minor: added an *options* parameter to `downloadZip`.
* new: Zip file size can now be predicted:
  - export the `predictLength` function to compute the size of a Zip file before creating it.
  - *options.length* can be set to include a "Content-Length" header in the Response.
  - *options.metadata* can instead be given the same argument as `predictLength`, as a shortcut to compute and set the Content-Length.
* minor: the worker script now supports all the input types supported in the ES module, not only Responses.

## 1.4.0:

* patch: fixed error in minified index.js from the previous version.

## 1.4.0:

* minor: used the `start` directive in WebAssembly to simplify (very slightly) the CRC32 module.

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
