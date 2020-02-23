module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': { diagnostics: { ignoreCodes: ['TS151001'] } }
  },
  setupFiles: ['./test/init.js'],
  roots: ['test/']
};