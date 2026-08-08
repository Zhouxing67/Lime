// pdfjs-dist is ESM-only (import.meta) — the CJS jest environment can't load
// it. The app's value usage lives behind the render pipeline (never called in
// tests); this mock satisfies the import so the module graph loads.
module.exports = {
  getDocument: () => {
    throw new Error("pdfjs-dist is not available in the test environment")
  }
}
