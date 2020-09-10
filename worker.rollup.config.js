const typescript = require("@rollup/plugin-typescript")
const { terser } = require("rollup-plugin-terser")

module.exports = {
  input: "src/worker.ts",
  output: {
    file: "worker.js",
    format: "iife",
    name: "downloadZip"
  },
  plugins: [
    typescript(),
    terser({ ecma: 2018, module: false,
      compress: { inline: 0, unsafe_arrows: true, booleans_as_integers: true },
      mangle: { reserved: ["m", "t", "c"], // the WebAssembly exports
        properties: { regex: /^crc$|^uncompressedSize$|^modDate$|^bytes$|^encodedName$/ }}
    })
  ]
}
