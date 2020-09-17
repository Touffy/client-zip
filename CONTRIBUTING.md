# Contributing

## Welcome !

This is a small and relatively simple piece of code (don't let the low-level buffer operations fool you) implementing a (currently) small subset of an old thing called the ZIP file format (the specification is actually [included as a test file](test/APPNOTE.TXT)).

You can contribute by describing a feature or improvement you would like to have (including, but not limited to, the features listed in the roadmap) or reporting a bug. There are issue templates to help you with expressing those requests or reports on GitHub.

You can also propose an implementation of your feature or bugfix in the form of a Pull Request (write the issue first, so everyone will know someone is working on it). You can do that even if you feel that your coding skills are not quite up to it. I would be happy to help. Either way, this document contains some details on how to proceed.

## Prerequisites

For writing a Pull Request, basic knowledge of git and GitHub is required, though it is easy to acquire if you've never used them before. You'll also need a decent understanding of memory buffers and — of course — JavaScript!

[deno](https://deno.land/manual/getting_started/installation) must be installed on your machine to run the tests, and a code editor that understands TypeScript and the way deno does things like import paths. [The deno website](https://deno.land/manual/getting_started/setup_your_environment) is probably the best place to look. This repository already contains appropriate VSCode settings (just install the deno extension).

The bundling script uses node and a few NPM modules, but you don't really need to do any of that unless you want to publish your own version, so you shouldn't even need to run `npm install`.

## WebAssembly

If you want to play with the WebAssembly module or add new ones, you'll also need [the WebAssembly Binary Toolkit](https://github.com/WebAssembly/wabt). Install that using your OS's package manager. Or you could compile to WebAssembly from Rust or some other higher-level language, for which you'll need your usual toolset with LLVM.

After you've compiled a WASM file, the current process involves manually copying its base64 encoding into [crc32.ts](src/crc32.ts). This is my command line: `wat2wasm src/crc32.wat && base64 crc32.wasm | pbcopy` to copy the base64 string directly to the clipboard. The reason there is no automated WASM build and bundling is because I don't want to force every contributor to install the WebAssembly toolkit.

## Compatibility

If possible, ensure your code runs in the two latest major versions of Chrome, Edge, Safari and Firefox on desktop, as well as Safari for iOS and Chrome for Android.

An optional feature or performance improvement can ignore that requirement, in which case it must be dynamically loaded after successful feature detection (not browser detection).

## Test and document your change

If it's not obvious, write a few lines in the Pull Request to explain what you're doing and why.
When relevant, update the automated tests as well. Make sure the types remain accurate.

Don't forget to update the README and any other documentation that needs updating. Add your name to the copyright notice in the license if you want to.

You may also update the CHANGES file, but it's all right if you don't — I will update it when I accept the PR.
Also leave the version bump
(tagging master, updating the package.json, creating the release on GitHub and `npm publish`)
to me. I promise I'll be quick about it.

## Code style

I am not a big fan of rigid code style standards and tools like Prettier, which is why there are none in this project (well, except the one built into deno, but I don't use it). I am open to adding and/or using one eventually, if the code base and number of contributors grow enough to justify it.

I do appreciate linters for their capacity to detect errors, but TypeScript is more effective for that purpose. You are free to use a linter while working on your contributions, just don't include it in the Pull Request and avoid committing purely stylistic changes to existing code.

Use this freedom to write expressive code your way. As far as I am concerned, there is no requirement that all the code here should look alike.

## Design guidelines

That being said, your contribution should adhere to the library's design goals
(these are guidelines, so they are negotiable of course):

### Keep it simple

The library exposes a single pure function, `downloadZip`, that takes a variety of inputs and returns a `Response`. Stick to it. Don't export an object with methods and internal state. Don't create another archive format than ZIP (it's in the name of the library).

You may add options to `downloadZip` (an "options" object rather than an ordered list of many arguments),
or new properties for the input objects. Try to stay backwards-compatible and future-proof.

### Keep it small

Think twice before you add a runtime dependency. It's pretty nice not to have any.

If you add an internal class or basic object interface, add its propertiy names to the Terser option `mangle.properties.regex` and make sure there is no collision with native property names or the public API of `downloadZip`.

I don't want the source code to become more convoluted just for the sake of better minification, but I am proud of the tiny bundle size and I hope you share the sentiment.

### Keep it fast

client-zip makes some compromises to reduce memory usage and maintain a low time to first byte
(in particular the `03` flag i.e. not announcing file size and CRC32 in the file header, and being unable to set a Content-Length header in advance).
You could add an optional behavior that is more greedy, but not a default behavior.

### Use modern standards

client-zip doesn't even try to work in IE and other old browsers. You can and should use recent Web standards
as long as you comply with the [Compatibility] section.
