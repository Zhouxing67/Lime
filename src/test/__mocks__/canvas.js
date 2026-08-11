// Stub for the optional `canvas` native module (jsdom's optional peer). The
// native binary can't load on every machine (node ABI mismatch / no build
// tools), and jsdom gracefully skips canvas support when `createCanvas` is
// absent — our tests never render to a real canvas.
module.exports = {}
