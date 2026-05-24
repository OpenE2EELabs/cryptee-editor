import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: {
        ArrayBuffer: "readonly",
        Blob: "readonly",
        Buffer: "readonly",
        CryptoKey: "readonly",
        Event: "readonly",
        HTMLElement: "readonly",
        MessageEvent: "readonly",
        Record: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        WebSocket: "readonly",
        atob: "readonly",
        btoa: "readonly",
        crypto: "readonly",
        document: "readonly",
        fetch: "readonly",
        location: "readonly",
        window: "readonly"
      },
      parserOptions: {
        project: "./tsconfig.json"
      }
    }
  }
];
