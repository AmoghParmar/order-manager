import { dbConfig } from "../../eslint.config.js"

// The local-database rules (`dbConfig` in the root eslint.config.js). The build runs this lint first.
export default [
  ...dbConfig,
  {
    // An app-local Dexie store outside the app database, so the data-access rules do not apply.
    files: ["src/db/productDb.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
      "no-restricted-syntax": "off"
    }
  },
  {
    // The Pinia mirror over that app-local product Dexie store (not the app database), so it may
    // import it.
    files: ["src/store/productCache.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off"
    }
  }
]
