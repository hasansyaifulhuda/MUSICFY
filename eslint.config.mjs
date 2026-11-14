import { defineConfig } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
  {
    ignores: [
      "android/**",
      "release/**",
      ".next/**",
      "node_modules/**",
      "public/sw.js",
      "public/workers/**",
    ],
  },
  ...next,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
    },
  },
]);

