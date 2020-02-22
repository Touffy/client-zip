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
