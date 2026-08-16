module.exports = {
  preset: "ts-jest",
  testEnvironment: "<rootDir>/src/test/jsdom-env.js",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.ts?(x)", "**/?(*.)+(spec|test).ts?(x)"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/types/**",
    "!src/**/*.stories.tsx"
  ],
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "<rootDir>/src/test/__mocks__/styleMock.js",
    "\\.(jpg|jpeg|png|gif|svg)$": "<rootDir>/src/test/__mocks__/fileMock.js",
    "^konva$": "konva/lib/index.js",
    "^canvas$": "<rootDir>/src/test/__mocks__/canvas.js",
    "^pdfjs-dist$": "<rootDir>/src/test/__mocks__/pdfjs-dist.js"
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          verbatimModuleSyntax: false,
          module: "commonjs",
          target: "es2020"
        }
      }
    ]
  }
}
