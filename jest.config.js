module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    atob: s => Buffer.from(s, "base64").toString("binary"),
    'ts-jest': { diagnostics: { ignoreCodes: ['TS151001'] } }
  },
  roots: ['test/']
};