const typescript = require("@rollup/plugin-typescript")
const { terser } = require("rollup-plugin-terser")

module.exports = {
  input: "src/index.ts",
  output: {
    file: "index.min.js",
    format: "esm",
    preserveModules: true,
  },
  plugins: [
    typescript({ exclude: [] }),
    terser({ ecma: 2018, module: true, compress: { inline: 0, unsafe_arrows: true } })
  ]
}
