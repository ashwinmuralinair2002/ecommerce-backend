import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["eslint.config.mjs"]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.browser,
        Swal: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      "no-console": "off",
      "no-extra-semi": "warn",
      "no-irregular-whitespace": "error"
    }
  }
];