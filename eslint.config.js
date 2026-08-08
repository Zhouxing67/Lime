// Minimal ESLint config — ONLY the React hooks correctness rules (no stylistic
// rules; Prettier owns formatting). exhaustive-deps is an "error" so a missing
// dep (the stale-closure bug class, e.g. the sidebarTab regression) fails CI.
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  {
    ignores: ["build/", "node_modules/", "assets/pdfjs/", "stubs/"]
  },
  tseslint.configs.base,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error"
    }
  }
]
