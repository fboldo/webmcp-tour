import { defineConfig } from "vite";

export default defineConfig({
  // localhost is a secure context, which WebMCP needs.
  server: { host: "localhost", port: 5173, strictPort: false },
  build: { target: "esnext" }, // top-level await in main.ts
});
