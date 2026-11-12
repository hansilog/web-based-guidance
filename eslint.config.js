import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  // --- ADD THIS BLOCK TO IGNORE BUILT FILES ---
  {
    // tests/ are Node scripts (npm test), not browser code
    ignores: ["dist/**", "node_modules/**", "webpack.*.js", "tests/**"],
  },
  // ---------------------------------------------

  js.configs.recommended,
  ...compat.extends("eslint-config-airbnb-base"),
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        // Filled in by webpack's DefinePlugin at build time
        __GEMINI_API_KEY__: "readonly",
        __SUPABASE_URL__: "readonly",
        __SUPABASE_ANON_KEY__: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "warn",
      "import/extensions": "off",
      "import/no-extraneous-dependencies": "off",
      "no-underscore-dangle": ["error", { allow: ["__filename", "__dirname"] }],
      "no-param-reassign": ["error", { props: false }],
      "import/prefer-default-export": "off",
      "no-use-before-define": "off",
      "no-alert": "off",
      "consistent-return": "off",
      "no-shadow": "off", // Silences the 'n already declared' errors
      "no-plusplus": "off", // Allows i++
    },
  },
  eslintConfigPrettier,
];
