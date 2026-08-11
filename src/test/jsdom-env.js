const JSDOMEnvModule = require("jest-environment-jsdom")
const JSDOMEnvironment = JSDOMEnvModule.default || JSDOMEnvModule

// jsdom optionally uses the native `canvas` module (its optional peer) for
// real canvas rendering. On machines where the prebuilt binary can't load
// (node ABI mismatch / no build tools) jsdom CRASHES at require time, which
// takes down the whole suite. Our tests never render to a real node canvas,
// so route `canvas` to an empty stub BEFORE jsdom loads: jsdom sees no
// `createCanvas` and gracefully skips canvas support. Works whether canvas is
// installed (broken binary) or absent entirely.
class LimeJSDOMEnvironment extends JSDOMEnvironment {
  constructor(config, context) {
    try {
      const canvasPath = require.resolve("canvas")
      require.cache[canvasPath] = {
        id: canvasPath,
        filename: canvasPath,
        loaded: true,
        exports: {}
      }
    } catch {
      // canvas not installed — jsdom's own try/catch handles it
    }
    super(config, context)
  }
}

module.exports = LimeJSDOMEnvironment
