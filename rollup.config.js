const typescript = require("@rollup/plugin-typescript")
const { terser } = require("rollup-plugin-terser")

module.exports = {
  input: "src/index.ts",
  output: {
    file: "index.js",
    format: "esm",
    preserveModules: true,
  },
  plugins: [
    typescript({ exclude: [] }),
    terser({ ecma: 2018, module: true,
      compress: { inline: 0, unsafe_arrows: true, booleans_as_integers: true },
      mangle: { reserved: ["i", "m", "t", "c"], // i.m is the WebAssembly Memory, t and c are its exports
        properties: { regex: /^crc$|^uncompressedSize$|^modDate$|^bytes$|^encodedName$/ }}
    })
  ]
}
